import path from 'path';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';

ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || ffmpegInstaller.path);
ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || ffprobeInstaller.path);

import { loadEsm } from 'load-esm';
import { IMediaMetadata } from '../models/mediafile.model';
import { getErrorMessage } from '../../../shared/utils/error.util';

export class MediaProcessorService {
  private mm: typeof import('music-metadata') | null = null;

  constructor(
    private repository: MediaFileRepository,
    private mediaRoot: string,
    private thumbnailDir: string,
    private previewDir: string,
    private subtitleDir: string
  ) {}

  private async getMusicMetadata() {
    if (!this.mm) {
      this.mm = await loadEsm<typeof import('music-metadata')>('music-metadata');
    }
    return this.mm;
  }

  async processFile(id: string): Promise<void> {
    await this._worker(id);
  }

  private async _worker(id: string): Promise<void> {
    const file = await this.repository.findById(id);
    if (!file) return;

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
      } else if (file.mimeType.startsWith('image')) {
        // Generate small WebP thumbnail for images
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
          // Fallback to original if sharp fails
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

          // Generate Thumbnail (Static frame at 15%)
          const thumbnailName = `${file._id.toString()}.jpg`;
          metadata.thumbnailPath = path.join('.cache/thumbnails', thumbnailName);

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

          // Generate Preview (Animated WebP from 4 segments)
          if (metadata.duration && metadata.duration > 5) {
            const previewName = `${file._id.toString()}_preview.webp`;
            const previewPath = path.join(this.previewDir, previewName);
            const d = metadata.duration;
            const timestamps = [d * 0.15, d * 0.35, d * 0.60, d * 0.85];

            try {
              await new Promise<void>((resolve, reject) => {
                const cmd = ffmpeg();
                timestamps.forEach(t => {
                  cmd.input(fullPath).seekInput(t).duration(1);
                });
                
                cmd
                  .complexFilter([
                    '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]',
                    '[v]scale=480:-1,fps=12[out]'
                  ])
                  .outputOptions([
                    '-map [out]',
                    '-loop 0',
                    '-vcodec libwebp',
                    '-lossless 0',
                    '-qscale 40',
                    '-an'
                  ])
                  .on('end', () => resolve())
                  .on('error', (err) => reject(err))
                  .save(previewPath);
              });
              metadata.previewPath = path.join('.cache/preview', previewName);
            } catch (err) {
              console.error(`Preview generation error for ${file.savedName}:`, err);
            }
          }

          // Extract Subtitles
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
