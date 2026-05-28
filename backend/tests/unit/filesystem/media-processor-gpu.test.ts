import { MediaProcessorService } from '@/domains/filesystem/services/media-processor.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import { SettingsRepository } from '@/domains/identity/repositories/settings.repository';
import { GpuManagerService } from '@/domains/filesystem/services/gpu-manager.service';
import ffmpeg from 'fluent-ffmpeg';
import { loadEsm } from 'load-esm';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('@/domains/identity/repositories/settings.repository');
jest.mock('@/domains/filesystem/services/gpu-manager.service');
jest.mock('fluent-ffmpeg');
jest.mock('load-esm');
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Track how many preview ffmpeg processes are running at the same time
let activeFfmpegCount = 0;
let maxConcurrentFfmpeg = 0;

function createMockFfmpeg(delayMs: number = 50) {
  const mockInstance: any = {
    eventListeners: {} as Record<string, Function>,
    input: jest.fn().mockImplementation(function (this: any) { return this; }),
    seekInput: jest.fn().mockImplementation(function (this: any) { return this; }),
    duration: jest.fn().mockImplementation(function (this: any) { return this; }),
    complexFilter: jest.fn().mockImplementation(function (this: any) { return this; }),
    outputOptions: jest.fn().mockImplementation(function (this: any) { return this; }),
    output: jest.fn().mockImplementation(function (this: any) { return this; }),
    noVideo: jest.fn().mockImplementation(function (this: any) { return this; }),
    audioChannels: jest.fn().mockImplementation(function (this: any) { return this; }),
    audioFrequency: jest.fn().mockImplementation(function (this: any) { return this; }),
    format: jest.fn().mockImplementation(function (this: any) { return this; }),
    run: jest.fn().mockImplementation(function (this: any) {
      const endCb = this.eventListeners['end'];
      if (endCb) setImmediate(() => endCb());
      return this;
    }),
    save: jest.fn().mockImplementation(function (this: any) {
      // Track concurrency
      activeFfmpegCount++;
      maxConcurrentFfmpeg = Math.max(maxConcurrentFfmpeg, activeFfmpegCount);
      const endCb = this.eventListeners['end'];
      if (endCb) {
        setTimeout(() => {
          activeFfmpegCount--;
          endCb();
        }, delayMs);
      }
      return this;
    }),
    screenshots: jest.fn().mockImplementation(function (this: any) {
      const endCb = this.eventListeners['end'];
      if (endCb) setImmediate(() => endCb());
      return this;
    }),
    pipe: jest.fn().mockImplementation(function (this: any) {
      const stream: any = {
        on: jest.fn().mockImplementation((event: string, cb: Function) => {
          if (event === 'data') {
            setImmediate(() => {
              cb(Buffer.from(new Array(1000).fill(10)));
              if (stream.endCb) stream.endCb();
            });
          } else if (event === 'end') {
            stream.endCb = cb;
          }
          return stream;
        }),
      };
      return stream;
    }),
    on: jest.fn().mockImplementation(function (this: any, event: string, cb: Function) {
      this.eventListeners[event] = cb;
      return this;
    }),
  };
  return mockInstance;
}

describe('MediaProcessorService — Preview Queue & GpuManager', () => {
  let mockRepo: jest.Mocked<MediaFileRepository>;
  let mockSettingsRepo: jest.Mocked<SettingsRepository>;
  let mockGpuManager: jest.Mocked<GpuManagerService>;

  beforeEach(() => {
    jest.clearAllMocks();
    activeFfmpegCount = 0;
    maxConcurrentFfmpeg = 0;

    mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
    mockSettingsRepo = new SettingsRepository() as jest.Mocked<SettingsRepository>;
    mockGpuManager = new GpuManagerService() as jest.Mocked<GpuManagerService>;

    mockGpuManager.allocate.mockReturnValue({
      encoderName: 'h264_nvenc',
      hwaccelArgs: [],
      scaleFilterName: 'scale',
    });

    mockSettingsRepo.getSettings.mockResolvedValue({
      hardwareEncoder: 'nvenc',
    } as any);

    const mockMm = { parseFile: jest.fn() };
    (loadEsm as jest.Mock).mockResolvedValue(mockMm);
  });

  // ─────────────────────────────────────────────
  // 1. GpuManager integration in preview generation
  // ─────────────────────────────────────────────
  describe('GpuManager in preview generation', () => {
    it('should use gpuManager.allocate() instead of getEncoder() for preview', async () => {
      mockGpuManager.allocate.mockReturnValue({
        encoderName: 'h264_amf',
        hwaccelArgs: [],
        scaleFilterName: 'scale'
      });

      const mockFfmpegInstance = createMockFfmpeg();
      (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpegInstance);
      (ffmpeg.ffprobe as unknown as jest.Mock).mockImplementation((_path: string, cb: Function) => {
        cb(null, {
          format: { duration: 120 },
          streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
        });
      });

      mockRepo.findById.mockResolvedValue({
        _id: 'file1',
        mimeType: 'video/mp4',
        path: 'video.mp4',
        savedName: 'video.mp4',
      } as any);

      const service = new MediaProcessorService(
        mockRepo,
        mockSettingsRepo,
        'C:/media',
        'C:/media/.cache/thumbnails',
        'C:/media/.cache/preview',
        'C:/media/.cache/subtitles',
        'C:/media/.cache/waveforms',
        mockGpuManager,
      );

      await service.processFile('file1');

      expect(mockGpuManager.allocate).toHaveBeenCalled();
    });

    it('should NOT have the legacy getEncoder method', () => {
      const service = new MediaProcessorService(
        mockRepo,
        mockSettingsRepo,
        'C:/media',
        'C:/media/.cache/thumbnails',
        'C:/media/.cache/preview',
        'C:/media/.cache/subtitles',
        'C:/media/.cache/waveforms',
        mockGpuManager,
      );

      expect((service as any).getEncoder).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // 2. Preview generation concurrency limit
  // ─────────────────────────────────────────────
  describe('Preview generation queue (concurrency limiter)', () => {
    it('should limit concurrent preview ffmpeg processes', async () => {
      // Use a delay to simulate slow preview generation
      const mockFfmpegInstance = createMockFfmpeg(100);
      (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpegInstance);
      (ffmpeg.ffprobe as unknown as jest.Mock).mockImplementation((_path: string, cb: Function) => {
        cb(null, {
          format: { duration: 120 },
          streams: [{ codec_type: 'video', width: 1920, height: 1080 }],
        });
      });

      const files = Array.from({ length: 5 }, (_, i) => ({
        _id: `file${i}`,
        mimeType: 'video/mp4',
        path: `video${i}.mp4`,
        savedName: `video${i}.mp4`,
      }));

      mockRepo.findById.mockImplementation((id: string) => {
        return Promise.resolve(files.find(f => f._id === id) as any);
      });

      const service = new MediaProcessorService(
        mockRepo,
        mockSettingsRepo,
        'C:/media',
        'C:/media/.cache/thumbnails',
        'C:/media/.cache/preview',
        'C:/media/.cache/subtitles',
        'C:/media/.cache/waveforms',
        mockGpuManager,
        2, // previewConcurrency limit = 2
      );

      // Fire all 5 at once
      await Promise.all(files.map(f => service.processFile(f._id)));

      // The concurrency limit should have kept max parallel ffmpeg calls under control
      // It should be at most previewConcurrency (2), not all 5
      expect(maxConcurrentFfmpeg).toBeLessThanOrEqual(2);
    });
  });
});
