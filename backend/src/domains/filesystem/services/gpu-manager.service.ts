import { execSync } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { IGpuConfig } from '../../identity/models/settings.model';

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
  totalScore: number;         // Sum of FPS across all codecs (for sorting)
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

// Allowed target codecs (to filter out unsupported ones like mjpeg)
const TARGET_CODECS = ['h264', 'hevc', 'av1', 'vp8', 'vp9', 'mpeg2'];

// Vendors that support multiple physical GPU devices
const MULTI_DEVICE_VENDORS: Set<GpuDevice['vendor']> = new Set(['intel', 'nvidia']);

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export class GpuManagerService {
  private allDevices: GpuDevice[] = [];
  private activeDevices: GpuDevice[] = [];
  private activeCodec: string = 'libx264';
  private initialized = false;
  private benchmarkAssetPath: string = join(tmpdir(), 'prism_benchmark_asset.mp4');

  private generateBenchmarkAsset(): void {
    if (existsSync(this.benchmarkAssetPath)) {
      return;
    }
    
    console.log(`[GpuManager] Generating benchmark media asset (this runs once)...`);
    const ffmpegBin = this.getFfmpegBin();
    // Generate a 2-second 1080p H.264 video to use as a real transcoding source
    const cmd = `"${ffmpegBin}" -hide_banner -y -f lavfi -i testsrc=s=1920x1080:d=2:r=30 -vf format=nv12 -c:v libx264 -preset ultrafast "${this.benchmarkAssetPath}"`;
    
    try {
      execSync(cmd, { timeout: 60_000 });
      console.log(`[GpuManager] Benchmark asset created at ${this.benchmarkAssetPath}`);
    } catch (err) {
      console.error(`[GpuManager] Failed to generate benchmark asset. Benchmarks may fail.`, err);
    }
  }

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
    } else if (encoderName.includes('vaapi')) {
      return {
        hwaccelArgs: ['-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi'],
        scaleFilterName: 'scale_vaapi',
      };
    } else if (encoderName.includes('videotoolbox')) {
      return {
        hwaccelArgs: ['-hwaccel', 'videotoolbox'],
        scaleFilterName: 'scale',
      };
    }
    
    // CPU Fallback (includes v4l2m2m, rkmpp which act similar to CPU for scale)
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
        const isHw = HW_ENCODER_PATTERNS.some(pattern => name.includes(pattern));
        const isTarget = TARGET_CODECS.some(codec => name.startsWith(`${codec}_`) || name.includes(codec));

        if (isHw && isTarget) {
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
      const { hwaccelArgs } = this.getHwaccelConfig(encoderName, deviceIndex);

      const encoderOpts = encoderName.includes('nvenc') && typeof deviceIndex === 'number'
        ? `-c:v ${encoderName} -gpu ${deviceIndex}`
        : `-c:v ${encoderName}`;

      const cmd = [
        `"${ffmpegBin}" -hide_banner -y`,
        ...hwaccelArgs,
        `-i "${this.benchmarkAssetPath}"`,
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

    this.generateBenchmarkAsset();

    const discovered = await this.discoverEncoders();

    if (discovered.length === 0) {
      console.log('[GpuManager] No hardware encoders discovered. Falling back to CPU (libx264).');
      this.allDevices = [this.createCpuFallback()];
      this.activeDevices = [...this.allDevices];
      this.activeCodec = 'libx264';
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
          let totalScore = probeResult.fps;

          for (const enc of encoders) {
            if (enc === probeEncoder) continue; // Already probed
            const result = await this.benchmarkEncoder(enc, devIdx);
            if (result.fps > 0) {
              console.log(`[GpuManager] Benchmark: ${enc} (device ${devIdx}) = ${result.fps} fps ✓`);
              codecs.push({ encoderName: enc, benchmarkFps: result.fps });
              totalScore += result.fps;
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
            totalScore
          });
        }
      } else {
        // Single-device vendor (AMF, VideoToolbox, etc.)
        const codecs: GpuCodecInfo[] = [];
        let bestFps = 0;
        let totalScore = 0;
        let primaryCodec = encoders[0];
        let deviceName: string | undefined;

        for (const enc of encoders) {
          const result = await this.benchmarkEncoder(enc);
          if (result.fps > 0) {
            console.log(`[GpuManager] Benchmark: ${enc} = ${result.fps} fps ✓`);
            codecs.push({ encoderName: enc, benchmarkFps: result.fps });
            totalScore += result.fps;
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
          physicalDevices.push({ vendor, codecs, primaryCodec, bestFps, totalScore, deviceName });
        }
      }
    }

    if (physicalDevices.length === 0) {
      console.log('[GpuManager] All hardware encoders failed benchmark. Falling back to CPU (libx264).');
      this.allDevices = [this.createCpuFallback()];
    } else {
      // Sort by totalScore descending — most capable overall device first
      this.allDevices = physicalDevices.sort((a, b) => b.totalScore - a.totalScore);

      console.log(`[GpuManager] ─── GPU Pool Summary ───`);
      for (const dev of this.allDevices) {
        const codecList = dev.codecs.map(c => `${c.encoderName}(${c.benchmarkFps}fps)`).join(', ');
        console.log(`[GpuManager]   ${dev.deviceName || dev.vendor} [device ${dev.deviceIndex ?? '-'}] primary=${dev.primaryCodec} | score: ${dev.totalScore} | codecs: ${codecList}`);
      }
      console.log(`[GpuManager] Fastest GPU overall: ${this.allDevices[0].deviceName || this.allDevices[0].primaryCodec} (Score: ${this.allDevices[0].totalScore})`);
    }

    this.activeDevices = [...this.allDevices];
    this.activeCodec = this.activeDevices[0].primaryCodec;
    this.initialized = true;
  }

  applyConfig(config: Partial<IGpuConfig>): void {
    if (!config || this.allDevices.length === 0) return;

    const { encoderType = 'auto', codecType = 'auto', multiGpuPool = true, preferredDevice = 'auto' } = config;

    console.log(`[GpuManager] Applying config: encoder=${encoderType}, codec=${codecType}, multiGpu=${multiGpuPool}, preferredDevice=${preferredDevice}`);

    // Step 1: Find best codec globally if auto
    let targetCodecBase = codecType === 'auto' ? 'h264' : codecType;
    if (codecType === 'auto') {
      const codecSums = new Map<string, number>();
      for (const dev of this.allDevices) {
        for (const c of dev.codecs) {
          const baseCodec = c.encoderName.split('_')[0] || c.encoderName;
          codecSums.set(baseCodec, (codecSums.get(baseCodec) || 0) + c.benchmarkFps);
        }
      }
      let bestSum = 0;
      for (const [base, sum] of codecSums.entries()) {
        if (sum > bestSum) {
          bestSum = sum;
          targetCodecBase = base;
        }
      }
      if (bestSum === 0) targetCodecBase = 'h264';
    }

    // Step 2 & 3: Filter by encoderType and finding devices that support the target codec
    let filtered = this.allDevices.filter(dev => {
      if (encoderType === 'cpu') return dev.vendor === 'cpu';
      if (encoderType !== 'auto') {
        const vendor = this.resolveVendor(encoderType);
        if (vendor !== dev.vendor) return false;
      }
      // Must support the target codec
      return dev.codecs.some(c => c.encoderName.startsWith(`${targetCodecBase}_`) || c.encoderName === targetCodecBase);
    });

    if (filtered.length === 0) {
      console.warn(`[GpuManager] Configured encoder/codec not found, falling back to auto.`);
      filtered = [...this.allDevices];
      targetCodecBase = 'h264'; // simple fallback
    }

    // Find the exact encoder name (activeCodec) that has the best FPS for targetCodecBase
    let bestCodecName = '';
    let bestCodecFps = -1;
    for (const dev of filtered) {
      for (const c of dev.codecs) {
        if (c.encoderName.startsWith(`${targetCodecBase}_`) || c.encoderName === targetCodecBase) {
          if (c.benchmarkFps > bestCodecFps) {
            bestCodecFps = c.benchmarkFps;
            bestCodecName = c.encoderName;
          }
        }
      }
    }

    if (!bestCodecName) {
      bestCodecName = filtered[0].primaryCodec; // absolute fallback
    }

    this.activeCodec = bestCodecName;

    // Filter to ONLY devices that support activeCodec
    filtered = filtered.filter(dev => dev.codecs.some(c => c.encoderName === this.activeCodec));

    // Sort by FPS for this specific activeCodec (Primary Device selection)
    filtered.sort((a, b) => {
      const fpsA = a.codecs.find(c => c.encoderName === this.activeCodec)?.benchmarkFps || 0;
      const fpsB = b.codecs.find(c => c.encoderName === this.activeCodec)?.benchmarkFps || 0;
      return fpsB - fpsA;
    });

    // Step 4: Device Filtering and Multi-GPU Mutual Exclusivity
    let isMultiGpu = multiGpuPool;
    if (preferredDevice !== 'auto') {
      const match = filtered.find(d => (d.deviceName || d.vendor) === preferredDevice);
      if (match) {
        filtered = [match];
        isMultiGpu = false;
      } else {
        console.warn(`[GpuManager] Preferred device ${preferredDevice} not found or doesn't support active codec, ignoring.`);
      }
    }

    if (!isMultiGpu && filtered.length > 0) {
      filtered = [filtered[0]]; // Only keep primary
    }

    this.activeDevices = filtered;
    console.log(`[GpuManager] Config applied. Active Codec: ${this.activeCodec}. Active Pool: ${this.activeDevices.map(d => d.deviceName || d.vendor).join(', ')}`);
  }

  /**
   * Get all available physical GPU devices (all probed devices, not just active).
   */
  getDevices(): GpuDevice[] {
    return [...this.allDevices];
  }

  /**
   * Allocate a GPU for a transcoding task.
   * Picks a PHYSICAL device, then uses activeCodec.
   */
  allocate(options: AllocateOptions = {}): GpuAllocation {
    const { isFiller } = options;

    // Pick physical device
    let deviceIdx = 0;
    if (isFiller && this.activeDevices.length > 1) {
      deviceIdx = 1; // Use secondary GPU for background filler tasks
    }
    const device = this.activeDevices[deviceIdx] || this.activeDevices[0];

    const encoderName = this.activeCodec;

    return {
      encoderName,
      ...this.getHwaccelConfig(encoderName, device?.deviceIndex),
    };
  }

  /**
   * Allocate a GPU for a specific segment index using round-robin distribution.
   */
  allocateForSegment(segmentIndex: number, options: AllocateOptions = {}): GpuAllocation {
    if (this.activeDevices.length === 0) {
      return { encoderName: 'libx264', ...this.getHwaccelConfig('libx264') };
    }

    const targetDeviceIdx = segmentIndex % this.activeDevices.length;
    const device = this.activeDevices[targetDeviceIdx];
    const encoderName = this.activeCodec;

    return {
      encoderName,
      ...this.getHwaccelConfig(encoderName, device.deviceIndex),
    };
  }

  canBenefitFromPool(targetFps: number): boolean {
    if (this.activeDevices.length < 2) return false;
    // best.bestFps was for primaryCodec, but we should use activeCodec fps
    const bestFps = this.activeDevices[0].codecs.find(c => c.encoderName === this.activeCodec)?.benchmarkFps || 0;
    if (bestFps <= 0 || bestFps >= targetFps) return false;
    return true;
  }

  /**
   * Returns the number of physical devices available for concurrent segment processing.
   */
  getPoolSize(): number {
    return Math.max(1, this.activeDevices.length);
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private resolveVendor(encoderName: string): GpuDevice['vendor'] {
    if (encoderName === 'v4l2m2m' || encoderName === 'rkmpp') return 'cpu'; // They act similar to CPU structurally here
    for (const [pattern, vendor] of Object.entries(VENDOR_MAP)) {
      if (encoderName.includes(pattern)) return vendor;
    }
    return 'cpu';
  }

  private createCpuFallback(): GpuDevice {
    return {
      vendor: 'cpu',
      codecs: [{ encoderName: 'libx264', benchmarkFps: 0 }],
      primaryCodec: 'libx264',
      bestFps: 0,
      totalScore: 0,
    };
  }
}
