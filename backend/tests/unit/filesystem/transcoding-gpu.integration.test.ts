import { TranscodingService } from '@/domains/filesystem/services/transcoding.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import { SettingsRepository } from '@/domains/identity/repositories/settings.repository';
import { GpuManagerService } from '@/domains/filesystem/services/gpu-manager.service';
import ffmpeg from 'fluent-ffmpeg';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('@/domains/identity/repositories/settings.repository');
jest.mock('@/domains/filesystem/services/gpu-manager.service');
jest.mock('fluent-ffmpeg');
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(''),
  stat: jest.fn().mockRejectedValue(new Error('ENOENT')),
  readdir: jest.fn().mockResolvedValue([]),
  rm: jest.fn().mockResolvedValue(undefined),
}));

function createMockFfmpegCommand() {
  const listeners: Record<string, Function> = {};
  const instance: any = {
    inputOptions: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function (this: any, event: string, cb: Function) {
      listeners[event] = cb;
      return this;
    }),
    save: jest.fn().mockImplementation(function (this: any) {
      // Simulate start event after save
      if (listeners['start']) setImmediate(() => listeners['start']('ffmpeg command'));
      return this;
    }),
    kill: jest.fn(),
    _listeners: listeners,
  };
  return instance;
}

describe('TranscodingService — GpuManager Integration', () => {
  let service: TranscodingService;
  let mockRepo: jest.Mocked<MediaFileRepository>;
  let mockSettingsRepo: jest.Mocked<SettingsRepository>;
  let mockGpuManager: jest.Mocked<GpuManagerService>;
  let mockFfmpegCommand: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
    mockSettingsRepo = new SettingsRepository() as jest.Mocked<SettingsRepository>;
    mockGpuManager = new GpuManagerService() as jest.Mocked<GpuManagerService>;

    // Default allocation: auto-detected encoder
    mockGpuManager.allocate = jest.fn().mockReturnValue({
      encoderName: 'h264_nvenc',
      hwaccelArgs: [],
    });
    mockGpuManager.getDevices = jest.fn().mockReturnValue([
      { encoderName: 'h264_nvenc', vendor: 'nvidia', benchmarkFps: 120 },
    ]);

    mockFfmpegCommand = createMockFfmpegCommand();
    (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpegCommand);

    service = new TranscodingService(
      mockRepo,
      mockSettingsRepo,
      'C:/media',
      'C:/media/.cache/transcode',
      mockGpuManager,
    );
  });

  // ─────────────────────────────────────────────
  // 1. Uses GpuManager.allocate() instead of getEncoder()
  // ─────────────────────────────────────────────
  describe('GpuManager integration', () => {
    it('should call gpuManager.allocate() when starting transcoding', async () => {
      const mockFile = {
        _id: 'file1',
        originalName: 'video.mp4',
        path: 'video.mp4',
        metadata: { duration: 120 },
      } as any;

      mockRepo.findById.mockResolvedValue(mockFile);
      mockSettingsRepo.getSettings.mockResolvedValue({
        transcodeMode: 'JIT',
        hardwareEncoder: 'nvenc', // legacy field, should be ignored
        targetQualities: [1080, 720, 480],
      } as any);

      // Trigger transcoding via getHlsManifest (which calls startTranscoding internally)
      try {
        await service.getHlsManifest('file1', 720);
      } catch {
        // May throw due to mocking, that's ok — we just need to verify allocate was called
      }

      expect(mockGpuManager.allocate).toHaveBeenCalled();
    });

    it('should pass the encoder name from GpuManager to ffmpeg outputOptions', async () => {
      mockGpuManager.allocate.mockReturnValue({
        encoderName: 'h264_amf',
        hwaccelArgs: [],
        scaleFilterName: 'scale',
      });

      const mockFile = {
        _id: 'file2',
        originalName: 'video2.mp4',
        path: 'video2.mp4',
        metadata: { duration: 60 },
      } as any;

      mockRepo.findById.mockResolvedValue(mockFile);
      mockSettingsRepo.getSettings.mockResolvedValue({
        transcodeMode: 'JIT',
        targetQualities: [720],
      } as any);

      try {
        await service.getHlsManifest('file2', 720);
      } catch {
        // Expected
      }

      // Verify that ffmpeg was configured with the correct encoder from GpuManager
      const outputOptionsCalls = mockFfmpegCommand.outputOptions.mock.calls;
      const allArgs = outputOptionsCalls.flat().flat();
      expect(allArgs).toContain('h264_amf');
    });
  });

  // ─────────────────────────────────────────────
  // 2. Intel DeepLink: correct flags
  // ─────────────────────────────────────────────
  describe('Intel DeepLink flags', () => {
    it('should NOT have -dual_core flag anywhere', async () => {
      mockGpuManager.allocate.mockReturnValue({
        encoderName: 'h264_qsv',
        hwaccelArgs: [
          '-hwaccel', 'qsv',
          '-hwaccel_output_format', 'qsv'
        ],
        scaleFilterName: 'vpp_qsv',
      });

      const mockFile = {
        _id: 'file3',
        originalName: 'heavy.mp4',
        path: 'heavy.mp4',
        metadata: { duration: 300 },
      } as any;

      mockRepo.findById.mockResolvedValue(mockFile);
      mockSettingsRepo.getSettings.mockResolvedValue({
        transcodeMode: 'JIT',
        hardwareEncoder: 'qsv_deeplink', // legacy field
        targetQualities: [1080],
      } as any);

      try {
        await service.getHlsManifest('file3', 1080);
      } catch {
        // Expected
      }

      // Verify no -dual_core in any option
      const inputCalls = mockFfmpegCommand.inputOptions.mock.calls;
      const outputCalls = mockFfmpegCommand.outputOptions.mock.calls;
      const allInputArgs = inputCalls.flat().flat().join(' ');
      const allOutputArgs = outputCalls.flat().flat().join(' ');

      expect(allInputArgs).not.toContain('-dual_core');
      expect(allOutputArgs).not.toContain('-dual_core');
    });

    it('should include hwaccelArgs from GpuManager in inputOptions', async () => {
      const hwaccelArgs = [
        '-init_hw_device', 'qsv=hw,child_device_type=d3d11va',
        '-filter_hw_device', 'hw',
      ];

      mockGpuManager.allocate.mockReturnValue({
        encoderName: 'h264_qsv',
        hwaccelArgs,
        scaleFilterName: 'vpp_qsv',
      });

      const mockFile = {
        _id: 'file4',
        originalName: 'test.mp4',
        path: 'test.mp4',
        metadata: { duration: 60 },
      } as any;

      mockRepo.findById.mockResolvedValue(mockFile);
      mockSettingsRepo.getSettings.mockResolvedValue({
        transcodeMode: 'JIT',
        targetQualities: [720],
      } as any);

      try {
        await service.getHlsManifest('file4', 720);
      } catch {
        // Expected
      }

      const inputCalls = mockFfmpegCommand.inputOptions.mock.calls;
      const allInputArgs = inputCalls.flat().flat();

      expect(allInputArgs).toContain('-init_hw_device');
      expect(allInputArgs).toContain('qsv=hw,child_device_type=d3d11va');
    });
  });

  // ─────────────────────────────────────────────
  // 3. Old getEncoder() is removed
  // ─────────────────────────────────────────────
  describe('Legacy getEncoder removal', () => {
    it('should not have a getEncoder method', () => {
      // getEncoder was a private method, but we can check it's gone
      expect((service as any).getEncoder).toBeUndefined();
    });
  });
});
