import { GpuManagerService, GpuDevice } from '@/domains/filesystem/services/gpu-manager.service';

jest.mock('child_process');

describe('GpuManager — Worker Pool (Multi-GPU Segment Distribution)', () => {
  let gpuManager: GpuManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    gpuManager = new GpuManagerService();
  });

  // ─────────────────────────────────────────────
  // 1. allocateForSegment() round-robin across GPUs
  // ─────────────────────────────────────────────
  describe('allocateForSegment()', () => {
    it('should distribute segments across multiple GPUs in round-robin', () => {
      // Manually set devices to simulate 2 GPUs
      (gpuManager as any).devices = [
        { encoderName: 'h264_nvenc', vendor: 'nvidia', benchmarkFps: 120 },
        { encoderName: 'h264_qsv', vendor: 'intel', benchmarkFps: 80 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      const seg0 = gpuManager.allocateForSegment(0);
      const seg1 = gpuManager.allocateForSegment(1);
      const seg2 = gpuManager.allocateForSegment(2);
      const seg3 = gpuManager.allocateForSegment(3);

      // Round-robin: 0→nvenc, 1→qsv, 2→nvenc, 3→qsv
      expect(seg0.encoderName).toBe('h264_nvenc');
      expect(seg1.encoderName).toBe('h264_qsv');
      expect(seg2.encoderName).toBe('h264_nvenc');
      expect(seg3.encoderName).toBe('h264_qsv');
    });

    it('should use single GPU when only one is available', () => {
      (gpuManager as any).devices = [
        { encoderName: 'h264_nvenc', vendor: 'nvidia', benchmarkFps: 120 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      const seg0 = gpuManager.allocateForSegment(0);
      const seg1 = gpuManager.allocateForSegment(1);

      expect(seg0.encoderName).toBe('h264_nvenc');
      expect(seg1.encoderName).toBe('h264_nvenc');
    });

    it('should fall back to libx264 when no devices available', () => {
      (gpuManager as any).devices = [];
      (gpuManager as any).initialized = true;

      const seg0 = gpuManager.allocateForSegment(0);
      expect(seg0.encoderName).toBe('libx264');
    });
  });

  // ─────────────────────────────────────────────
  // 2. canBenefitFromPool() — determine if multi-GPU is useful
  // ─────────────────────────────────────────────
  describe('canBenefitFromPool()', () => {
    it('should return true when best GPU alone cannot reach target FPS', () => {
      (gpuManager as any).devices = [
        { encoderName: 'h264_nvenc', vendor: 'nvidia', benchmarkFps: 18 },
        { encoderName: 'h264_qsv', vendor: 'intel', benchmarkFps: 12 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      // Best GPU = 18fps, target = 30fps → need pool
      expect(gpuManager.canBenefitFromPool(30)).toBe(true);
    });

    it('should return false when best GPU alone can handle target FPS', () => {
      (gpuManager as any).devices = [
        { encoderName: 'h264_nvenc', vendor: 'nvidia', benchmarkFps: 120 },
        { encoderName: 'h264_qsv', vendor: 'intel', benchmarkFps: 80 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      // Best GPU = 120fps, target = 30fps → no need for pool
      expect(gpuManager.canBenefitFromPool(30)).toBe(false);
    });

    it('should return false when only CPU fallback is available', () => {
      (gpuManager as any).devices = [
        { encoderName: 'libx264', vendor: 'cpu', benchmarkFps: 0 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      // CPU has 0 benchmarkFps — pool makes no sense
      expect(gpuManager.canBenefitFromPool(30)).toBe(false);
    });

    it('should return false with single device even if slow', () => {
      (gpuManager as any).devices = [
        { encoderName: 'h264_nvenc', vendor: 'nvidia', benchmarkFps: 15 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      // Only 1 GPU — can't pool, even if slow
      expect(gpuManager.canBenefitFromPool(30)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // 3. getPoolSize() — how many GPUs to use concurrently
  // ─────────────────────────────────────────────
  describe('getPoolSize()', () => {
    it('should return number of available HW devices', () => {
      (gpuManager as any).devices = [
        { encoderName: 'h264_nvenc', vendor: 'nvidia', benchmarkFps: 120 },
        { encoderName: 'h264_qsv', vendor: 'intel', benchmarkFps: 80 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      expect(gpuManager.getPoolSize()).toBe(2);
    });

    it('should return 1 for CPU-only fallback', () => {
      (gpuManager as any).devices = [
        { encoderName: 'libx264', vendor: 'cpu', benchmarkFps: 0 },
      ] as GpuDevice[];
      (gpuManager as any).initialized = true;

      expect(gpuManager.getPoolSize()).toBe(1);
    });
  });
});
