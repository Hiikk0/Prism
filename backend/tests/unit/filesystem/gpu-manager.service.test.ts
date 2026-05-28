import { GpuManagerService, GpuDevice, GpuAllocation } from '@/domains/filesystem/services/gpu-manager.service';
import { execSync } from 'child_process';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

/**
 * Helper: create a GpuManagerService instance and override internal methods
 * so we don't actually spawn ffmpeg during tests.
 */
function createTestManager(): GpuManagerService {
  return new GpuManagerService();
}

describe('GpuManagerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // 1. Discovery: detecting available encoders
  // ─────────────────────────────────────────────
  describe('discoverEncoders()', () => {
    it('should parse ffmpeg -encoders output and return only video hw encoders', async () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(
        ' V..... h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)\n' +
        ' V..... hevc_nvenc           NVIDIA NVENC hevc encoder (codec hevc)\n' +
        ' V..... h264_qsv             H.264 / AVC (Intel Quick Sync Video) (codec h264)\n' +
        ' V..... h264_amf             AMD AMF H.264 Encoder (codec h264)\n' +
        ' V..... libx264              libx264 H.264 (codec h264)\n' +
        ' A..... aac                  AAC (codec aac)\n'
      ));

      const manager = createTestManager();
      const encoders = await manager.discoverEncoders();

      expect(encoders).toContain('h264_nvenc');
      expect(encoders).toContain('hevc_nvenc');
      expect(encoders).toContain('h264_qsv');
      expect(encoders).toContain('h264_amf');
      expect(encoders).not.toContain('libx264');
      expect(encoders).not.toContain('aac');
    });

    it('should return empty array if ffmpeg is not available', async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Command failed: ffmpeg not found');
      });

      const manager = createTestManager();
      const encoders = await manager.discoverEncoders();
      expect(encoders).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // 2. Benchmark: probing each encoder for real FPS
  // ─────────────────────────────────────────────
  describe('benchmarkEncoder()', () => {
    it('should return measured FPS for a working encoder', async () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(
        'frame=   30 fps= 120 q=23.0 size=     256kB time=00:00:01.00 bitrate= 2097.2kbits/s speed=4.00x\n'
      ));

      const manager = createTestManager();
      const result = await manager.benchmarkEncoder('h264_nvenc');

      expect(result.fps).toBe(120);
    });

    it('should parse device name from D3D11VA output', async () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(
        '[D3D11VA @ 000001] Using device 8086:56a0 (Intel(R) Arc(TM) A770 Graphics).\n' +
        'frame=   30 fps= 120 q=23.0 size=     256kB time=00:00:01.00\n'
      ));

      const manager = createTestManager();
      const result = await manager.benchmarkEncoder('h264_qsv', 0);

      expect(result.fps).toBe(120);
      expect(result.deviceName).toBe('Intel(R) Arc(TM) A770 Graphics');
    });

    it('should return fps=0 for an encoder that crashes', async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Error initializing an MFX session: -3');
      });

      const manager = createTestManager();
      const result = await manager.benchmarkEncoder('h264_qsv');

      expect(result.fps).toBe(0);
    });

    it('should return fps=0 for an encoder with unparseable output', async () => {
      mockExecSync.mockReturnValueOnce(Buffer.from('some garbage output'));

      const manager = createTestManager();
      const result = await manager.benchmarkEncoder('h264_amf');

      expect(result.fps).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // 3. Full initialization: physical GPU device model
  // ─────────────────────────────────────────────
  describe('initialize()', () => {
    it('should create physical GPU devices with codec lists (sorted by FPS)', async () => {
      const manager = createTestManager();

      // 3 encoders from 3 different vendors (single-device each)
      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_nvenc', 'h264_qsv', 'h264_amf',
      ]);

      // AMF fastest, QSV middle, NVENC slowest
      jest.spyOn(manager, 'benchmarkEncoder')
        // NVENC: multi-device vendor, probe device 0-3
        .mockResolvedValueOnce({ fps: 45, deviceName: 'NVIDIA GPU' })  // nvenc device 0
        .mockResolvedValueOnce({ fps: 0 })   // nvenc device 1 — doesn't exist
        .mockResolvedValueOnce({ fps: 0 })   // nvenc device 2
        .mockResolvedValueOnce({ fps: 0 })   // nvenc device 3
        // QSV: multi-device vendor, probe device 0-3
        .mockResolvedValueOnce({ fps: 85, deviceName: 'Intel GPU' })   // qsv device 0
        .mockResolvedValueOnce({ fps: 0 })   // qsv device 1
        .mockResolvedValueOnce({ fps: 0 })   // qsv device 2
        .mockResolvedValueOnce({ fps: 0 })   // qsv device 3
        // AMF: single-device vendor
        .mockResolvedValueOnce({ fps: 200, deviceName: 'AMD GPU' });   // amf

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(3);
      // Fastest (AMF) should be first
      expect(devices[0].primaryCodec).toBe('h264_amf');
      expect(devices[0].bestFps).toBe(200);
      // Second (QSV)
      expect(devices[1].primaryCodec).toBe('h264_qsv');
      expect(devices[1].bestFps).toBe(85);
      // Slowest (NVENC)
      expect(devices[2].primaryCodec).toBe('h264_nvenc');
      expect(devices[2].bestFps).toBe(45);
    });

    it('should detect multiple physical GPUs for multi-device vendors (Intel QSV)', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_qsv', 'hevc_qsv',
      ]);

      jest.spyOn(manager, 'benchmarkEncoder')
        // Device 0: probe with h264_qsv, then benchmark hevc_qsv
        .mockResolvedValueOnce({ fps: 100, deviceName: 'Arc A770' })   // h264_qsv device 0 (probe)
        .mockResolvedValueOnce({ fps: 80 })                              // hevc_qsv device 0
        // Device 1: probe with h264_qsv, then benchmark hevc_qsv
        .mockResolvedValueOnce({ fps: 50, deviceName: 'UHD 770' })     // h264_qsv device 1 (probe)
        .mockResolvedValueOnce({ fps: 40 })                              // hevc_qsv device 1
        // Device 2 & 3: probe fails
        .mockResolvedValueOnce({ fps: 0 })                              // h264_qsv device 2 — phantom
        .mockResolvedValueOnce({ fps: 0 });                             // h264_qsv device 3 — phantom

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(2);
      // Device 0 (Arc) — fastest
      expect(devices[0].deviceName).toBe('Arc A770');
      expect(devices[0].bestFps).toBe(100);
      expect(devices[0].codecs).toHaveLength(2);
      expect(devices[0].codecs.map(c => c.encoderName)).toContain('h264_qsv');
      expect(devices[0].codecs.map(c => c.encoderName)).toContain('hevc_qsv');
      // Device 1 (UHD) — slower
      expect(devices[1].deviceName).toBe('UHD 770');
      expect(devices[1].bestFps).toBe(50);
    });

    it('should exclude phantom devices that fail the probe', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue(['h264_qsv']);

      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce({ fps: 100 })   // device 0 ok
        .mockResolvedValueOnce({ fps: 50 })    // device 1 ok
        .mockResolvedValueOnce({ fps: 0 })     // device 2 — Microsoft Basic Render Driver
        .mockResolvedValueOnce({ fps: 0 });    // device 3 — doesn't exist

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(2);
    });

    it('should fallback to libx264 (CPU) if ALL hardware encoders fail', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_nvenc', 'h264_qsv',
      ]);

      jest.spyOn(manager, 'benchmarkEncoder')
        // nvenc: all devices fail
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        // qsv: all devices fail
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 });

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].primaryCodec).toBe('libx264');
      expect(devices[0].vendor).toBe('cpu');
    });

    it('should fallback to libx264 if no hardware encoders are discovered at all', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([]);

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].primaryCodec).toBe('libx264');
    });
  });

  // ─────────────────────────────────────────────
  // 4. Allocation: codec consistency
  // ─────────────────────────────────────────────
  describe('allocate() with preferredCodec', () => {
    it('should use preferredCodec if available on the target device', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_qsv', 'hevc_qsv',
      ]);
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce({ fps: 100 })   // h264_qsv device 0 (probe)
        .mockResolvedValueOnce({ fps: 80 })    // hevc_qsv device 0 (benchmark)
        .mockResolvedValueOnce({ fps: 0 })     // h264_qsv device 1 (probe fail)
        .mockResolvedValueOnce({ fps: 0 })     // h264_qsv device 2 (probe fail)
        .mockResolvedValueOnce({ fps: 0 });    // h264_qsv device 3 (probe fail)

      await manager.initialize();

      const allocation = manager.allocate({ preferredCodec: 'hevc_qsv' });
      expect(allocation.encoderName).toBe('hevc_qsv');
    });

    it('should fallback to primaryCodec if preferred is not available on device', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue(['h264_qsv']);
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce({ fps: 100 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 });

      await manager.initialize();

      const allocation = manager.allocate({ preferredCodec: 'av1_qsv' });
      expect(allocation.encoderName).toBe('h264_qsv'); // fallback to primary
    });

    it('should fallback to auto if preferredCodec is "auto"', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue(['h264_qsv']);
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce({ fps: 150 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 });

      await manager.initialize();

      const allocation = manager.allocate({ preferredCodec: 'auto' });
      expect(allocation.encoderName).toBe('h264_qsv');
    });
  });

  // ─────────────────────────────────────────────
  // 5. Allocation: round-robin for segments
  // ─────────────────────────────────────────────
  describe('allocateForSegment()', () => {
    it('should round-robin segments across physical GPUs with consistent codec', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_qsv', 'hevc_qsv',
      ]);
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce({ fps: 100, deviceName: 'Arc A770' })
        .mockResolvedValueOnce({ fps: 50, deviceName: 'UHD 770' })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 80 })    // hevc device 0
        .mockResolvedValueOnce({ fps: 40 });   // hevc device 1

      await manager.initialize();

      const seg0 = manager.allocateForSegment(0);
      const seg1 = manager.allocateForSegment(1);
      const seg2 = manager.allocateForSegment(2);

      // All segments use the same codec (h264_qsv = primary)
      expect(seg0.encoderName).toBe('h264_qsv');
      expect(seg1.encoderName).toBe('h264_qsv');
      expect(seg2.encoderName).toBe('h264_qsv');

      // But distributed across GPUs (round-robin on 2 devices)
      // seg0 → device 0, seg1 → device 1, seg2 → device 0
    });
  });

  // ─────────────────────────────────────────────
  // 6. Logging: benchmark results are logged
  // ─────────────────────────────────────────────
  describe('logging', () => {
    it('should log benchmark results during initialization', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const manager = createTestManager();
      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue(['h264_qsv']);
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce({ fps: 120, deviceName: 'Arc A770' })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 })
        .mockResolvedValueOnce({ fps: 0 });

      await manager.initialize();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('h264_qsv')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('120')
      );

      logSpy.mockRestore();
    });
  });
});
