import { execSync } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface GpuCodecInfo {
  encoderName: string;       // 'h264_qsv', 'hevc_qsv', 'av1_qsv'
  benchmarkFps: number;      // measured FPS from synthetic probe
}

export interface GpuDevice {
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'cpu';
  deviceIndex?: number;
  deviceName?: string;        // e.g. 'Intel(R) Arc(TM) A770 Graphics'
  codecs: GpuCodecInfo[];     // All codecs benchmarked on this physical device
  primaryCodec: string;       // Default codec (most compatible, e.g. 'h264_qsv')
  bestFps: number;            // FPS of the primary codec (for sorting)
}

export interface GpuAllocation {
  encoderName: string;
  hwaccelArgs: string[];     // e.g. ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv', ...]
  scaleFilterName: string;   // e.g. 'vpp_qsv' or 'scale_cuda' or 'scale'
}

interface AllocateOptions {
  preferredCodec?: string;   // 'auto' | 'h264_qsv' | 'libx264' etc.
  resolution?: string;       // e.g. '1920x1080' or '15360x8640'
  isFiller?: boolean;
}

// Known hardware encoder prefixes → vendor mapping
const VENDOR_MAP: Record<string, GpuDevice['vendor']> = {
  nvenc: 'nvidia',
  cuvid: 'nvidia',
  amf: 'amd',
  qsv: 'intel',
  videotoolbox: 'apple',
  vaapi: 'intel',
};

// Known hardware encoder name patterns
const HW_ENCODER_PATTERNS = [
  'nvenc', 'amf', 'qsv', 'videotoolbox', 'vaapi', 'v4l2m2m', 'rkmpp',
];

// Vendors that support multiple physical GPU devices
const MULTI_DEVICE_VENDORS: Set<GpuDevice['vendor']> = new Set(['intel', 'nvidia']);

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export class GpuManagerService {
  private devices: GpuDevice[] = [];
  private initialized = false;

  /**
   * Resolve FFmpeg binary path at call time (after dotenv has loaded).
   * This MUST NOT be a top-level constant — env vars aren't available at import time.
   */
  private getFfmpegBin(): string {
    return process.env.FFMPEG_PATH || ffmpegInstaller.path;
  }

  private getHwaccelConfig(encoderName: string, deviceIndex?: number): { hwaccelArgs: string[], scaleFilterName: string } {
    if (encoderName.includes('qsv')) {
      const args: string[] = ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv'];
      if (typeof deviceIndex === 'number') {
        // Use -init_hw_device for reliable device selection on multi-GPU Intel systems
        args.unshift('-init_hw_device', `qsv=hw,child_device=${deviceIndex}`, '-filter_hw_device', 'hw');
      }
      return { hwaccelArgs: args, scaleFilterName: 'vpp_qsv' };
    } else if (encoderName.includes('nvenc')) {
      const args: string[] = ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'];
      if (typeof deviceIndex === 'number') {
        args.push('-hwaccel_device', deviceIndex.toString());
      }
      return { hwaccelArgs: args, scaleFilterName: 'scale_cuda' };
    } else if (encoderName.includes('amf')) {
      return {
        hwaccelArgs: ['-hwaccel', 'd3d11va', '-hwaccel_output_format', 'd3d11'],
        scaleFilterName: 'scale',
      };
    }
    
    // CPU Fallback
    return {
      hwaccelArgs: [],
      scaleFilterName: 'scale',
    };
  }

  /**
   * Discover available hardware video encoders by parsing `ffmpeg -encoders`.
   * Returns an array of encoder names like ['h264_nvenc', 'h264_qsv', 'hevc_qsv'].
   */
  async discoverEncoders(): Promise<string[]> {
    try {
      const ffmpegBin = this.getFfmpegBin();
      const output = execSync(`"${ffmpegBin}" -hide_banner -encoders 2>&1`, {
        timeout: 10_000,
      }).toString();

      const encoders: string[] = [];

      for (const line of output.split('\n')) {
        const match = line.match(/^\s*V\S*\s+(\S+)/);
        if (!match) continue;

        const name = match[1];
        if (HW_ENCODER_PATTERNS.some(pattern => name.includes(pattern))) {
          encoders.push(name);
        }
      }

      return encoders;
    } catch {
      console.error('[GpuManager] Failed to run ffmpeg -encoders. Is ffmpeg installed?');
      return [];
    }
  }

  /**
   * Run a short synthetic benchmark for a given encoder on a specific device.
   * Encodes ~1s of dummy video and parses the FPS from ffmpeg output.
   * Returns 0 if the encoder crashes or is unavailable on the device.
   */
  async benchmarkEncoder(encoderName: string, deviceIndex?: number): Promise<{ fps: number, deviceName?: string }> {
    try {
      const ffmpegBin = this.getFfmpegBin();

      // Build device-selection flag (only for multi-device vendors)
      let deviceArg = '';
      if (typeof deviceIndex === 'number') {
        if (encoderName.includes('qsv')) {
          deviceArg = `-init_hw_device qsv=hw,child_device=${deviceIndex}`;
        } else if (encoderName.includes('nvenc')) {
          // NVENC uses -gpu as an encoder option; for benchmark, pass via output opts
          deviceArg = ''; // handled below in encoder options
        }
      }

      // -vf format=nv12 ensures compatibility with h264, hevc, and av1 hardware encoders
      const encoderOpts = encoderName.includes('nvenc') && typeof deviceIndex === 'number'
        ? `-c:v ${encoderName} -gpu ${deviceIndex}`
        : `-c:v ${encoderName}`;

      const cmd = [
        `"${ffmpegBin}" -hide_banner -y`,
        deviceArg,
        '-f lavfi -i nullsrc=s=1280x720:d=1:r=30',
        '-vf format=nv12',
        encoderOpts,
        '-f null -',
        '2>&1',
      ].filter(Boolean).join(' ');

      const output = execSync(cmd, { timeout: 30_000 }).toString();

      // Parse device name from D3D11VA output
      let deviceName: string | undefined;
      const deviceMatch = output.match(/Using device \S+ \((.+)\)\./);
      if (deviceMatch) {
        deviceName = deviceMatch[1];
      }

      // If QSV but no device name, it fell back to software mode (phantom) -> reject
      if (encoderName.includes('qsv') && !deviceName) {
        return { fps: 0, deviceName };
      }

      // Parse fps from output: prefer speed= since short encodes might show fps=0.0
      let fps = 0;
      const speedMatches = [...output.matchAll(/speed=\s*([\d.]+)x/g)];
      if (speedMatches.length > 0) {
        const lastMatch = speedMatches[speedMatches.length - 1];
        fps = Math.round(parseFloat(lastMatch[1]) * 30); // benchmark uses 30fps
      } else {
        const fpsMatches = [...output.matchAll(/fps=\s*([\d.]+)/g)];
        if (fpsMatches.length > 0) {
          fps = Math.round(parseFloat(fpsMatches[fpsMatches.length - 1][1]));
        }
      }

      if (fps > 0) {
        return { fps: Math.max(1, fps), deviceName };
      }

      return { fps: 0, deviceName };
    } catch (e: any) {
      const errOut = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
      console.log(`[GpuManager] Benchmark error for ${encoderName} (device ${deviceIndex ?? 'default'}):`, errOut.trim() || e.message);
      return { fps: 0 };
    }
  }

  /**
   * Full initialization:
   * 1. Discover available HW encoders
   * 2. Group by vendor
   * 3. Probe physical devices per vendor
   * 4. Benchmark all codecs on each valid physical device
   * 5. Build device list sorted by FPS (fastest first)
   * 6. Fallback to CPU if nothing works
   */
  async initialize(): Promise<void> {
    console.log('[GpuManager] Starting GPU detection and benchmarking...');
    console.log(`[GpuManager] Using ffmpeg: ${this.getFfmpegBin()}`);

    const discovered = await this.discoverEncoders();

    if (discovered.length === 0) {
      console.log('[GpuManager] No hardware encoders discovered. Falling back to CPU (libx264).');
      this.devices = [this.createCpuFallback()];
      this.initialized = true;
      return;
    }

    console.log(`[GpuManager] Discovered ${discovered.length} hardware encoder(s): ${discovered.join(', ')}`);

    // Group encoders by vendor
    const vendorGroups = new Map<GpuDevice['vendor'], string[]>();
    for (const enc of discovered) {
      const vendor = this.resolveVendor(enc);
      if (!vendorGroups.has(vendor)) vendorGroups.set(vendor, []);
      vendorGroups.get(vendor)!.push(enc);
    }

    const physicalDevices: GpuDevice[] = [];

    for (const [vendor, encoders] of vendorGroups) {
      // Use the first h264 encoder as probe (most compatible)
      const probeEncoder = encoders.find(e => e.startsWith('h264_')) || encoders[0];

      if (MULTI_DEVICE_VENDORS.has(vendor)) {
        // Probe up to 4 physical devices using the probe encoder
        for (let devIdx = 0; devIdx < 4; devIdx++) {
          const probeResult = await this.benchmarkEncoder(probeEncoder, devIdx);

          if (probeResult.fps <= 0) {
            console.log(`[GpuManager] Probe: ${probeEncoder} (device ${devIdx}) = FAILED ✗`);
            continue;
          }

          console.log(`[GpuManager] Probe: ${probeEncoder} (device ${devIdx}) = ${probeResult.fps} fps ✓ [${probeResult.deviceName || 'unknown'}]`);

          // Valid device found — benchmark all codecs of this vendor on it
          const codecs: GpuCodecInfo[] = [{ encoderName: probeEncoder, benchmarkFps: probeResult.fps }];

          for (const enc of encoders) {
            if (enc === probeEncoder) continue; // Already probed
            const result = await this.benchmarkEncoder(enc, devIdx);
            if (result.fps > 0) {
              console.log(`[GpuManager] Benchmark: ${enc} (device ${devIdx}) = ${result.fps} fps ✓`);
              codecs.push({ encoderName: enc, benchmarkFps: result.fps });
            } else {
              console.log(`[GpuManager] Benchmark: ${enc} (device ${devIdx}) = FAILED ✗`);
            }
          }

          physicalDevices.push({
            vendor,
            deviceIndex: devIdx,
            deviceName: probeResult.deviceName,
            codecs,
            primaryCodec: probeEncoder,
            bestFps: probeResult.fps,
          });
        }
      } else {
        // Single-device vendor (AMF, VideoToolbox, etc.)
        const codecs: GpuCodecInfo[] = [];
        let bestFps = 0;
        let primaryCodec = encoders[0];
        let deviceName: string | undefined;

        for (const enc of encoders) {
          const result = await this.benchmarkEncoder(enc);
          if (result.fps > 0) {
            console.log(`[GpuManager] Benchmark: ${enc} = ${result.fps} fps ✓`);
            codecs.push({ encoderName: enc, benchmarkFps: result.fps });
            if (!deviceName && result.deviceName) deviceName = result.deviceName;
            // Prefer h264 as primary for HLS compatibility
            if (enc.startsWith('h264_') && result.fps > 0) {
              primaryCodec = enc;
              bestFps = result.fps;
            } else if (result.fps > bestFps && !primaryCodec.startsWith('h264_')) {
              primaryCodec = enc;
              bestFps = result.fps;
            }
          } else {
            console.log(`[GpuManager] Benchmark: ${enc} = FAILED ✗`);
          }
        }

        if (codecs.length > 0) {
          if (bestFps === 0) bestFps = codecs[0].benchmarkFps;
          physicalDevices.push({ vendor, codecs, primaryCodec, bestFps, deviceName });
        }
      }
    }

    if (physicalDevices.length === 0) {
      console.log('[GpuManager] All hardware encoders failed benchmark. Falling back to CPU (libx264).');
      this.devices = [this.createCpuFallback()];
    } else {
      // Sort by FPS descending — fastest device first
      this.devices = physicalDevices.sort((a, b) => b.bestFps - a.bestFps);

      console.log(`[GpuManager] ─── GPU Pool Summary ───`);
      for (const dev of this.devices) {
        const codecList = dev.codecs.map(c => `${c.encoderName}(${c.benchmarkFps}fps)`).join(', ');
        console.log(`[GpuManager]   ${dev.deviceName || dev.vendor} [device ${dev.deviceIndex ?? '-'}] primary=${dev.primaryCodec} | codecs: ${codecList}`);
      }
      console.log(`[GpuManager] Primary GPU: ${this.devices[0].deviceName || this.devices[0].primaryCodec} (${this.devices[0].bestFps} fps)`);
    }

    this.initialized = true;
  }

  /**
   * Get all available physical GPU devices, sorted by benchmark FPS (fastest first).
   */
  getDevices(): GpuDevice[] {
    return [...this.devices];
  }

  /**
   * Allocate a GPU for a transcoding task.
   * Picks a PHYSICAL device, then selects the codec (consistent per session).
   */
  allocate(options: AllocateOptions = {}): GpuAllocation {
    const { preferredCodec, isFiller } = options;

    // Pick physical device
    let deviceIdx = 0;
    if (isFiller && this.devices.length > 1) {
      deviceIdx = 1; // Use secondary GPU for background filler tasks
    }
    const device = this.devices[deviceIdx] || this.devices[0];

    // Pick codec
    const encoderName = this.resolveCodec(device, preferredCodec);

    return {
      encoderName,
      ...this.getHwaccelConfig(encoderName, device.deviceIndex),
    };
  }

  /**
   * Allocate a GPU for a specific segment index using round-robin distribution.
   * Ensures codec consistency: the caller's preferredCodec is used on whichever GPU is picked.
   */
  allocateForSegment(segmentIndex: number, options: AllocateOptions = {}): GpuAllocation {
    if (this.devices.length === 0) {
      return { encoderName: 'libx264', ...this.getHwaccelConfig('libx264') };
    }

    const targetDeviceIdx = segmentIndex % this.devices.length;
    const device = this.devices[targetDeviceIdx];
    const encoderName = this.resolveCodec(device, options.preferredCodec);

    return {
      encoderName,
      ...this.getHwaccelConfig(encoderName, device.deviceIndex),
    };
  }

  /**
   * Determine whether using multiple GPUs (Worker Pool) would benefit
   * transcoding at a given target FPS.
   */
  canBenefitFromPool(targetFps: number): boolean {
    if (this.devices.length < 2) return false;
    const best = this.devices[0];
    if (best.bestFps <= 0 || best.bestFps >= targetFps) return false;
    return true;
  }

  /**
   * Returns the number of physical devices available for concurrent segment processing.
   */
  getPoolSize(): number {
    return Math.max(1, this.devices.length);
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private resolveVendor(encoderName: string): GpuDevice['vendor'] {
    for (const [pattern, vendor] of Object.entries(VENDOR_MAP)) {
      if (encoderName.includes(pattern)) return vendor;
    }
    return 'cpu';
  }

  /**
   * Resolve which codec to use on a device.
   * Prefers h264 for HLS compatibility unless explicitly overridden.
   */
  private resolveCodec(device: GpuDevice, preferredCodec?: string): string {
    if (preferredCodec && preferredCodec !== 'auto') {
      const found = device.codecs.find(c => c.encoderName === preferredCodec);
      if (found) return found.encoderName;
      // Preferred codec not available on this device — fall back to primary
      console.warn(`[GpuManager] Codec ${preferredCodec} not available on device ${device.deviceIndex ?? '-'}, using ${device.primaryCodec}`);
    }
    return device.primaryCodec;
  }

  private createCpuFallback(): GpuDevice {
    return {
      vendor: 'cpu',
      codecs: [{ encoderName: 'libx264', benchmarkFps: 0 }],
      primaryCodec: 'libx264',
      bestFps: 0,
    };
  }
}
