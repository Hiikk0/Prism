import path from 'path';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';

// NOTE: ffmpeg paths are set in the constructor (after dotenv has loaded), not at module level.

import { loadEsm } from 'load-esm';
import { IMediaMetadata, IMediaFile } from '../models/mediafile.model';
import { getErrorMessage } from '../../../shared/utils/error.util';
import { SettingsRepository } from '../../identity/repositories/settings.repository';
import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { GpuManagerService } from './gpu-manager.service';
import pLimit from 'p-limit';

export class MediaProcessorService {
  private mm: typeof import('music-metadata') | null = null;
  private previewLimiter: ReturnType<typeof pLimit>;

  constructor(
    private repository: MediaFileRepository,
    private settingsRepository: SettingsRepository,
    private mediaRoot: string,
    private thumbnailDir: string,
    private previewDir: string,
    private subtitleDir: string,
    private waveformDir: string,
    private gpuManager: GpuManagerService,
    previewConcurrency: number = 1
  ) {
    // Set ffmpeg paths here (after dotenv.config() has run in server.ts)
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || ffmpegInstaller.path);
    ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || ffprobeInstaller.path);
    this.previewLimiter = pLimit(previewConcurrency);
  }

  private async getMusicMetadata() {
    if (!this.mm) {
      this.mm = await loadEsm<typeof import('music-metadata')>('music-metadata');
    }
    return this.mm;
  }

  async processFile(id: string): Promise<void> {
    await this._worker(id);
  }

  // getEncoder() removed — replaced by GpuManagerService.allocate()

  private async generateWaveform(file: IMediaFile, fullPath: string, metadata: IMediaMetadata): Promise<void> {
    const waveformName = `${file._id.toString()}.json`;
    const waveformPath = path.join(this.waveformDir, waveformName);
    metadata.waveformPath = path.join('.cache/waveforms', waveformName);
    
    if (existsSync(waveformPath)) return;

    try {
      const points = 1000;
      const data = await new Promise<number[]>((resolve, reject) => {
        const samples: number[] = [];
        ffmpeg(fullPath)
          .noVideo()
          .audioChannels(1)
          .audioFrequency(points) // Roughly 1 sample per point if we use duration, but easier to just downsample
          .format('s8')
          .on('error', (err) => reject(err))
          .pipe()
          .on('data', (chunk: Buffer) => {
            for (let i = 0; i < chunk.length; i++) {
              samples.push(Math.abs(chunk.readInt8(i)) / 128);
            }
          })
          .on('end', () => {
            // Downsample/Upsample to exactly 'points'
            const result: number[] = [];
            const step = samples.length / points;
            for (let i = 0; i < points; i++) {
              const start = Math.floor(i * step);
              const end = Math.floor((i + 1) * step);
              let max = 0;
              for (let j = start; j < end && j < samples.length; j++) {
                if (samples[j] > max) max = samples[j];
              }
              result.push(parseFloat(max.toFixed(3)));
            }
            resolve(result);
          });
      });
      await writeFile(waveformPath, JSON.stringify(data));
    } catch (err) {
      console.error(`Waveform generation error for ${file.savedName}:`, err);
    }
  }

  private async _worker(id: string): Promise<void> {
    const file = await this.repository.findById(id);
    if (!file) return;

    const settings = await this.settingsRepository.getSettings();
    const fullPath = path.join(this.mediaRoot, file.path);
    const metadata: IMediaMetadata = {};

    try {
      if (file.mimeType.startsWith('audio')) {
        const mm = await this.getMusicMetadata();
        const audioMetadata = await mm.parseFile(fullPath);
        metadata.duration = Math.round(audioMetadata.format.duration || 0);
        metadata.artist = audioMetadata.common.artist;
        metadata.title = audioMetadata.common.title;
        metadata.album = audioMetadata.common.album;
        
        await this.generateWaveform(file, fullPath, metadata);
      } else if (file.mimeType.startsWith('image')) {
        const thumbnailName = `${file._id.toString()}_thumb.webp`;
        const thumbPath = path.join(this.thumbnailDir, thumbnailName);
        
        try {
          await sharp(fullPath, { failOn: 'none' })
            .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(thumbPath);
            
          metadata.thumbnailPath = path.join('.cache/thumbnails', thumbnailName);
        } catch (err) {
          console.error(`Sharp error for ${file.savedName}:`, err);
          metadata.thumbnailPath = file.path;
        }
      } else if (file.mimeType.startsWith('video') || file.mimeType === 'image/gif') {
        const isVideo = file.mimeType.startsWith('video');
        
        if (isVideo) {
          const ffprobeData: ffmpeg.FfprobeData = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(fullPath, (err, data) => (err ? reject(err) : resolve(data)));
          });

          metadata.duration = Math.round(ffprobeData.format.duration || 0);
          if (ffprobeData.streams) {
            const videoStream = ffprobeData.streams.find(s => s.codec_type === 'video');
            if (videoStream) {
              metadata.resolution = `${videoStream.width}x${videoStream.height}`;
            }
          }

          const thumbnailName = `${file._id.toString()}.jpg`;
          const thumbPath = path.join(this.thumbnailDir, thumbnailName);
          metadata.thumbnailPath = path.join('.cache/thumbnails', thumbnailName);

          if (!existsSync(thumbPath)) {
            await new Promise<void>((resolve, reject) => {
              ffmpeg(fullPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .screenshots({
                  timestamps: ['15%'],
                  filename: thumbnailName,
                  folder: this.thumbnailDir,
                  size: '480x?'
                });
            });
          }

          if (metadata.duration && metadata.duration > 15) {
            const previewName = `${file._id.toString()}_preview.mp4`;
            const previewPath = path.join(this.previewDir, previewName);
            metadata.previewPath = path.join('.cache/preview', previewName);

            if (!existsSync(previewPath)) {
              const d = metadata.duration;
              const timestamps = [d * 0.1, d * 0.3, d * 0.5, d * 0.7, d * 0.9];

              try {
                const allocation = this.gpuManager.allocate({ resolution: file.metadata?.resolution });
                const encoder = allocation.encoderName;
                await this.previewLimiter(() => new Promise<void>((resolve, reject) => {
                  const cmd = ffmpeg();
                  timestamps.forEach(t => {
                    cmd.input(fullPath).seekInput(t).duration(3);
                  });
                  
                  cmd
                    .complexFilter([
                      '[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0[v]',
                      '[v]scale=480:-1,fps=15[out]'
                    ])
                    .outputOptions([
                      '-map [out]',
                      '-c:v', encoder,
                      '-pix_fmt', 'yuv420p',
                      '-preset', 'veryfast',
                      '-b:v', '1500k',
                      '-an',
                      '-movflags', 'faststart'
                    ]);
                    // DeepLink flags are now handled by GpuManager (not hardcoded here)

                  cmd
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err))
                    .save(previewPath);
                }));
              } catch (err) {
                console.error(`Preview generation error for ${file.savedName}:`, err);
              }
            }
          }

          await this.generateWaveform(file, fullPath, metadata);

          const subtitleStreams = ffprobeData.streams.filter(s => s.codec_type === 'subtitle');
          if (subtitleStreams.length > 0) {
            metadata.subtitles = [];
            for (const stream of subtitleStreams) {
              const lang = stream.tags?.language || `unk-${stream.index}`;
              const title = stream.tags?.title || lang;
              const subFilename = `${file._id.toString()}-${lang}-${stream.index}.vtt`;
              const subPath = path.join(this.subtitleDir, subFilename);
              
              try {
                await new Promise<void>((resolve, reject) => {
                  ffmpeg(fullPath)
                    .outputOptions([`-map 0:${stream.index}`])
                    .output(subPath)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err))
                    .run();
                });
                
                metadata.subtitles.push({
                  language: lang,
                  label: title,
                  path: path.join('.cache/subtitles', subFilename)
                });
              } catch (err) {
                console.error(`Subtitle extraction error for ${file.savedName}:`, err);
              }
            }
          }
        } else {
          // It's a GIF
          const thumbnailName = `${file._id.toString()}_thumb.webp`;
          const thumbPath = path.join(this.thumbnailDir, thumbnailName);
          const previewName = `${file._id.toString()}_preview.webp`;
          const previewPath = path.join(this.previewDir, previewName);

          try {
            // Static thumbnail (first frame)
            await sharp(fullPath, { failOn: 'none' })
              .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80 })
              .toFile(thumbPath);
            metadata.thumbnailPath = path.join('.cache/thumbnails', thumbnailName);

            // Animated preview (small)
            await sharp(fullPath, { animated: true, failOn: 'none' })
              .resize(480, null, { withoutEnlargement: true })
              .webp({ quality: 50 })
              .toFile(previewPath);
            metadata.previewPath = path.join('.cache/preview', previewName);
          } catch (err) {
            console.error(`GIF processing error for ${file.savedName}:`, err);
            metadata.thumbnailPath = file.path;
          }
        }
      }

      await this.repository.update(id, { metadata });
    } catch (err: unknown) {
      console.error(`ERROR processing media ${id}:`, getErrorMessage(err));
    }
  }
}
