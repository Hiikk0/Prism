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
      // ffmpeg -encoders lists lines like:
      //  V..... h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
      //  V..... h264_qsv             H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (Intel Quick Sync Video acceleration) (codec h264)
      //  A..... aac                  AAC (Advanced Audio Coding) (codec aac)
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

      // Should include only hardware video encoders, not libx264 (software) or aac (audio)
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
      // Simulated ffmpeg benchmark output:
      // frame=   30 fps= 120 q=... size=... time=00:00:01.00 ...
      mockExecSync.mockReturnValueOnce(Buffer.from(
        'frame=   30 fps= 120 q=23.0 size=     256kB time=00:00:01.00 bitrate= 2097.2kbits/s speed=4.00x\n'
      ));

      const manager = createTestManager();
      const fps = await manager.benchmarkEncoder('h264_nvenc');

      expect(fps).toBeGreaterThan(0);
      expect(fps).toBe(120);
    });

    it('should return 0 for an encoder that crashes (e.g. qsv on nvidia)', async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Error initializing an MFX session: -3');
      });

      const manager = createTestManager();
      const fps = await manager.benchmarkEncoder('h264_qsv');

      expect(fps).toBe(0);
    });

    it('should return 0 for an encoder with unparseable output', async () => {
      mockExecSync.mockReturnValueOnce(Buffer.from('some garbage output'));

      const manager = createTestManager();
      const fps = await manager.benchmarkEncoder('h264_amf');

      expect(fps).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // 3. Full initialization: discover + benchmark + rank
  // ─────────────────────────────────────────────
  describe('initialize()', () => {
    it('should rank GPUs by benchmark FPS (fastest first), not by vendor', async () => {
      const manager = createTestManager();

      // Mock discover: find 3 encoders
      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_nvenc', 'h264_qsv', 'h264_amf',
      ]);

      // Mock benchmark: AMF is fastest (imagine a beefy RX 9900 vs old GTS 260 nvidia)
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce(45)   // h264_nvenc = 45 fps
        .mockResolvedValueOnce(85)   // h264_qsv  = 85 fps
        .mockResolvedValueOnce(200); // h264_amf  = 200 fps

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(3);
      // Fastest (AMF) should be first
      expect(devices[0].encoderName).toBe('h264_amf');
      expect(devices[0].benchmarkFps).toBe(200);
      // Second fastest
      expect(devices[1].encoderName).toBe('h264_qsv');
      expect(devices[1].benchmarkFps).toBe(85);
      // Slowest
      expect(devices[2].encoderName).toBe('h264_nvenc');
      expect(devices[2].benchmarkFps).toBe(45);
    });

    it('should exclude encoders that failed benchmark (fps=0)', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_nvenc', 'h264_qsv', 'h264_amf',
      ]);

      // QSV fails (e.g. tried qsv on nvidia machine), others pass
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce(120)  // nvenc ok
        .mockResolvedValueOnce(0)    // qsv failed
        .mockResolvedValueOnce(90);  // amf ok

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(2);
      expect(devices.map(d => d.encoderName)).not.toContain('h264_qsv');
    });

    it('should fallback to libx264 (CPU) if ALL hardware encoders fail', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_nvenc', 'h264_qsv',
      ]);

      // Both fail
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].encoderName).toBe('libx264');
      expect(devices[0].vendor).toBe('cpu');
    });

    it('should fallback to libx264 if no hardware encoders are discovered at all', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([]);

      await manager.initialize();

      const devices = manager.getDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].encoderName).toBe('libx264');
    });
  });

  // ─────────────────────────────────────────────
  // 4. preferredCodec override
  // ─────────────────────────────────────────────
  describe('allocate() with preferredCodec', () => {
    it('should use preferredCodec over auto-detected fastest encoder', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue([
        'h264_nvenc', 'h264_amf',
      ]);
      jest.spyOn(manager, 'benchmarkEncoder')
        .mockResolvedValueOnce(200)  // nvenc fastest
        .mockResolvedValueOnce(90);  // amf slower

      await manager.initialize();

      // User explicitly chose libx264 for quality
      const allocation = manager.allocate({ preferredCodec: 'libx264' });
      expect(allocation.encoderName).toBe('libx264');
    });

    it('should fallback to auto if preferredCodec is "auto"', async () => {
      const manager = createTestManager();

      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue(['h264_nvenc']);
      jest.spyOn(manager, 'benchmarkEncoder').mockResolvedValueOnce(150);

      await manager.initialize();

      const allocation = manager.allocate({ preferredCodec: 'auto' });
      expect(allocation.encoderName).toBe('h264_nvenc');
    });
  });

  // ─────────────────────────────────────────────
  // 5. Logging: benchmark results are logged
  // ─────────────────────────────────────────────
  describe('logging', () => {
    it('should log benchmark results during initialization', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const manager = createTestManager();
      jest.spyOn(manager, 'discoverEncoders').mockResolvedValue(['h264_nvenc']);
      jest.spyOn(manager, 'benchmarkEncoder').mockResolvedValueOnce(120);

      await manager.initialize();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('h264_nvenc')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('120')
      );

      logSpy.mockRestore();
    });
  });
});
