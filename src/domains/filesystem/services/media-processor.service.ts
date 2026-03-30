import path from 'path';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import ffmpeg from 'fluent-ffmpeg';
import * as fastq from 'fastq';
import type { queueAsPromised } from 'fastq';
import { loadEsm } from 'load-esm';

export class MediaProcessorService {
  private queue: queueAsPromised<string>;
  private mm: any = null;

  constructor(
    private repository: MediaFileRepository,
    private mediaRoot: string,
    private thumbnailDir: string
  ) {
    this.queue = fastq.promise(this._worker.bind(this), 2); // 2 parallel threads
  }

  private async getMusicMetadata() {
    if (!this.mm) {
      this.mm = await loadEsm<typeof import('music-metadata')>('music-metadata');
    }
    return this.mm;
  }

  async processFile(id: string): Promise<void> {
    await this.queue.push(id);
  }

  private async _worker(id: string): Promise<void> {
    const file = await this.repository.findById(id);
    if (!file) return;

    const fullPath = path.join(this.mediaRoot, file.path);
    const metadata: any = {};

    try {
      if (file.mimeType.startsWith('audio')) {
        const mm = await this.getMusicMetadata();
        const audioMetadata = await mm.parseFile(fullPath);
        metadata.duration = Math.round(audioMetadata.format.duration || 0);
        metadata.artist = audioMetadata.common.artist;
        metadata.title = audioMetadata.common.title;
        metadata.album = audioMetadata.common.album;
      } else if (file.mimeType.startsWith('video')) {
        const ffprobeData: any = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(fullPath, (err, data) => (err ? reject(err) : resolve(data)));
        });

        metadata.duration = Math.round(ffprobeData.format.duration || 0);
        if (ffprobeData.streams && ffprobeData.streams[0]) {
          const stream = ffprobeData.streams[0];
          metadata.resolution = `${stream.width}x${stream.height}`;
        }

        // Generate Thumbnail
        const thumbnailName = `${file.savedName.split('.')[0]}.jpg`;
        metadata.thumbnailPath = path.join('.cache/thumbnails', thumbnailName);

        await new Promise((resolve, reject) => {
          ffmpeg(fullPath)
            .on('end', resolve)
            .on('error', (err) => {
              console.error(`FFMPEG error for ${file.savedName}:`, err);
              reject(err);
            })
            .screenshots({
              timestamps: ['10%'],
              filename: thumbnailName,
              folder: this.thumbnailDir,
              size: '320x?'
            });
        });
      }

      await this.repository.update(id, { metadata });
    } catch (err) {
      console.error(`ERROR processing media ${id}:`, err);
    }
  }
}
