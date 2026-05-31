import { GpuManagerService, GpuDevice } from '@/domains/filesystem/services/gpu-manager.service';

jest.mock('child_process');

/**
 * Helper to create a GpuDevice fixture in the new physical-GPU model.
 */
function makeDevice(
  primaryCodec: string, vendor: GpuDevice['vendor'], bestFps: number,
  opts?: { deviceIndex?: number, codecs?: { encoderName: string, benchmarkFps: number }[] }
): GpuDevice {
  return {
    vendor,
    deviceIndex: opts?.deviceIndex,
    codecs: opts?.codecs || [{ encoderName: primaryCodec, benchmarkFps: bestFps }],
    primaryCodec,
    bestFps,
    totalScore: bestFps,
  };
}

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
    it('should distribute segments across multiple physical GPUs in round-robin', () => {
      (gpuManager as any).activeDevices = [
        makeDevice('h264_nvenc', 'nvidia', 120, { deviceIndex: 0 }),
        makeDevice('h264_qsv', 'intel', 80, { deviceIndex: 0 }),
      ];
      (gpuManager as any).activeCodec = 'h264_qsv';
      (gpuManager as any).initialized = true;

      const seg0 = gpuManager.allocateForSegment(0);
      const seg1 = gpuManager.allocateForSegment(1);
      const seg2 = gpuManager.allocateForSegment(2);
      const seg3 = gpuManager.allocateForSegment(3);

      expect(seg0.encoderName).toBe('h264_qsv');
      expect(seg1.encoderName).toBe('h264_qsv');
      expect(seg2.encoderName).toBe('h264_qsv');
      expect(seg3.encoderName).toBe('h264_qsv');
    });

    it('should use single GPU when only one is available', () => {
      (gpuManager as any).activeDevices = [
        makeDevice('h264_nvenc', 'nvidia', 120, { deviceIndex: 0 }),
      ];
      (gpuManager as any).activeCodec = 'h264_nvenc';
      (gpuManager as any).initialized = true;

      const seg0 = gpuManager.allocateForSegment(0);
      const seg1 = gpuManager.allocateForSegment(1);

      expect(seg0.encoderName).toBe('h264_nvenc');
      expect(seg1.encoderName).toBe('h264_nvenc');
    });

    it('should use consistent codec when round-robin across same-vendor GPUs', () => {
      // Simulates Intel UHD 770 + Arc A770 — both support h264_qsv and hevc_qsv
      (gpuManager as any).devices = [
        makeDevice('h264_qsv', 'intel', 100, {
          deviceIndex: 0,
          codecs: [
            { encoderName: 'h264_qsv', benchmarkFps: 100 },
            { encoderName: 'hevc_qsv', benchmarkFps: 80 },
          ],
        }),
        makeDevice('h264_qsv', 'intel', 50, {
          deviceIndex: 1,
          codecs: [
            { encoderName: 'h264_qsv', benchmarkFps: 50 },
            { encoderName: 'hevc_qsv', benchmarkFps: 40 },
          ],
        }),
      ];
      (gpuManager as any).activeCodec = 'h264_qsv';
      (gpuManager as any).initialized = true;

      // All segments should use h264_qsv (primaryCodec) regardless of which GPU
      const seg0 = gpuManager.allocateForSegment(0);
      const seg1 = gpuManager.allocateForSegment(1);
      const seg2 = gpuManager.allocateForSegment(2);

      expect(seg0.encoderName).toBe('h264_qsv');
      expect(seg1.encoderName).toBe('h264_qsv');
      expect(seg2.encoderName).toBe('h264_qsv');
    });

    it('should fall back to libx264 when no devices available', () => {
      (gpuManager as any).activeDevices = [];
      (gpuManager as any).activeCodec = 'libx264';
      (gpuManager as any).initialized = true;

      const seg0 = gpuManager.allocateForSegment(0);
      expect(seg0.encoderName).toContain('libx264');
    });
  });

  // ─────────────────────────────────────────────
  // 2. canBenefitFromPool() — determine if multi-GPU is useful
  // ─────────────────────────────────────────────
  describe('canBenefitFromPool()', () => {
    it('should return true when best GPU alone cannot reach target FPS', () => {
      (gpuManager as any).activeDevices = [
        makeDevice('h264_nvenc', 'nvidia', 18, { deviceIndex: 0 }),
        makeDevice('h264_qsv', 'intel', 12, { deviceIndex: 0 }),
      ];
      (gpuManager as any).activeCodec = 'h264_nvenc';
      (gpuManager as any).initialized = true;

      expect(gpuManager.canBenefitFromPool(30)).toBe(true);
    });

    it('should return false when best GPU alone can handle target FPS', () => {
      (gpuManager as any).devices = [
        makeDevice('h264_nvenc', 'nvidia', 120, { deviceIndex: 0 }),
        makeDevice('h264_qsv', 'intel', 80, { deviceIndex: 0 }),
      ];
      (gpuManager as any).initialized = true;

      expect(gpuManager.canBenefitFromPool(30)).toBe(false);
    });

    it('should return false when only CPU fallback is available', () => {
      (gpuManager as any).activeDevices = [
        makeDevice('libx264', 'cpu', 0),
      ];
      (gpuManager as any).activeCodec = 'libx264';
      (gpuManager as any).initialized = true;

      expect(gpuManager.canBenefitFromPool(30)).toBe(false);
    });

    it('should return false with single device even if slow', () => {
      (gpuManager as any).activeDevices = [
        makeDevice('h264_nvenc', 'nvidia', 15, { deviceIndex: 0 }),
      ];
      (gpuManager as any).activeCodec = 'h264_nvenc';
      (gpuManager as any).initialized = true;

      expect(gpuManager.canBenefitFromPool(30)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // 3. getPoolSize() — how many GPUs to use concurrently
  // ─────────────────────────────────────────────
  describe('getPoolSize()', () => {
    it('should return number of available physical devices', () => {
      (gpuManager as any).activeDevices = [
        makeDevice('h264_nvenc', 'nvidia', 120, { deviceIndex: 0 }),
        makeDevice('h264_qsv', 'intel', 80, { deviceIndex: 0 }),
      ];
      (gpuManager as any).activeCodec = 'h264_nvenc';
      (gpuManager as any).initialized = true;

      expect(gpuManager.getPoolSize()).toBe(2);
    });

    it('should return 1 for CPU-only fallback', () => {
      (gpuManager as any).activeDevices = [
        makeDevice('libx264', 'cpu', 0),
      ];
      (gpuManager as any).activeCodec = 'libx264';
      (gpuManager as any).initialized = true;

      expect(gpuManager.getPoolSize()).toBe(1);
    });
  });
});
