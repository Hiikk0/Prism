import { execSync } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const FFMPEG_BIN = process.env.FFMPEG_PATH || ffmpegInstaller.path;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface GpuDevice {
  encoderName: string;       // 'h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'cpu';
  benchmarkFps: number;      // measured FPS from synthetic probe
  deviceIndex?: number;
}

export interface GpuAllocation {
  encoderName: string;
  hwaccelArgs: string[];     // e.g. ['-hwaccel', 'cuda', '-hwaccel_device', '0']
  scaleFilterName: string;   // e.g. 'vpp_qsv' or 'scale_cuda' or 'scale'
}

interface AllocateOptions {
  preferredCodec?: string;   // 'auto' | 'h264_nvenc' | 'libx264' etc.
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
  vaapi: 'intel', // VAAPI is most commonly Intel on Linux, but can be AMD
};

// Known hardware encoder name patterns
const HW_ENCODER_PATTERNS = [
  'nvenc', 'amf', 'qsv', 'videotoolbox', 'vaapi', 'v4l2m2m', 'rkmpp',
];

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export class GpuManagerService {
  private devices: GpuDevice[] = [];
  private initialized = false;

  private getHwaccelConfig(encoderName: string, deviceIndex?: number): { hwaccelArgs: string[], scaleFilterName: string } {
    if (encoderName.includes('qsv')) {
      if (typeof deviceIndex === 'number') {
        return {
          hwaccelArgs: [
            '-hwaccel', 'qsv', 
            '-hwaccel_output_format', 'qsv',
            '-qsv_device', deviceIndex.toString()
          ],
          scaleFilterName: 'vpp_qsv'
        };
      }
      return {
        hwaccelArgs: ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv'],
        scaleFilterName: 'vpp_qsv'
      };
    } else if (encoderName.includes('nvenc')) {
      if (typeof deviceIndex === 'number') {
        return {
          hwaccelArgs: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', '-hwaccel_device', deviceIndex.toString()],
          scaleFilterName: 'scale_cuda'
        };
      }
      return {
        hwaccelArgs: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'],
        scaleFilterName: 'scale_cuda'
      };
    } else if (encoderName.includes('amf')) {
      return {
        hwaccelArgs: ['-hwaccel', 'd3d11va', '-hwaccel_output_format', 'd3d11'],
        scaleFilterName: 'scale' // AMF uses standard scale or scale_vulkan, d3d11 surface can be scaled usually
      };
    }
    
    // CPU Fallback or auto
    return {
      hwaccelArgs: ['-hwaccel', 'auto'],
      scaleFilterName: 'scale'
    };
  }

  /**
   * Discover available hardware video encoders by parsing `ffmpeg -encoders`.
   * Returns an array of encoder names like ['h264_nvenc', 'h264_qsv', 'h264_amf'].
   */
  async discoverEncoders(): Promise<string[]> {
    try {
      const output = execSync(`"${FFMPEG_BIN}" -hide_banner -encoders 2>&1`, {
        timeout: 10_000,
      }).toString();

      const encoders: string[] = [];

      for (const line of output.split('\n')) {
        // Format: " V..... h264_nvenc   NVIDIA NVENC ..."
        const match = line.match(/^\s*V\S*\s+(\S+)/);
        if (!match) continue;

        const name = match[1];

        // Only include known hardware encoders
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
   * Run a short synthetic benchmark for a given encoder.
   * Encodes ~1s of dummy video and parses the FPS from ffmpeg stderr output.
   * Returns 0 if the encoder crashes or output is unparseable.
   */
  async benchmarkEncoder(encoderName: string, deviceIndex?: number): Promise<number> {
    try {
      // Generate 30 frames of 720p black video and encode with the target encoder
      const { hwaccelArgs } = this.getHwaccelConfig(encoderName, deviceIndex);
      const hwaccelStr = hwaccelArgs.join(' ');
      
      const initHwArg = (deviceIndex !== undefined && encoderName.includes('qsv')) 
        ? `-init_hw_device qsv=hw,child_device=${deviceIndex}` 
        : '';

      const cmd = [
        `"${FFMPEG_BIN}" -hide_banner -y`,
        initHwArg,
        hwaccelStr,
        '-f lavfi -i nullsrc=s=1280x720:d=1:r=30',
        `-c:v ${encoderName}`,
        '-f null -',
        '2>&1',
      ].filter(Boolean).join(' ');

      const output = execSync(cmd, { timeout: 30_000 }).toString();

      // Parse fps from output: match all occurrences of "fps=" and take the last one
      const matches = [...output.matchAll(/fps=\s*([\d.]+)/g)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const fps = Math.round(parseFloat(lastMatch[1]));
        // If encoder is so fast (or frames so few) that ffmpeg reports fps=0.0,
        // we still return at least 1 because it successfully completed the task.
        return Math.max(1, fps);
      }

      return 0;
    } catch (e: any) {
      // Encoder crashed or is unavailable (e.g. qsv on nvidia)
      const errOut = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '');
      console.log(`[GpuManager] Benchmark error for ${encoderName}:`, errOut.trim() || e.message);
      return 0;
    }
  }

  /**
   * Full initialization:
   * 1. Discover available HW encoders
   * 2. Benchmark each one (probe)
   * 3. Exclude failed ones
   * 4. Rank by FPS (fastest first)
   * 5. Fallback to CPU if nothing works
   */
  async initialize(): Promise<void> {
    console.log('[GpuManager] Starting GPU detection and benchmarking...');

    const discovered = await this.discoverEncoders();

    if (discovered.length === 0) {
      console.log('[GpuManager] No hardware encoders discovered. Falling back to CPU (libx264).');
      this.devices = [this.createCpuFallback()];
      this.initialized = true;
      return;
    }

    console.log(`[GpuManager] Discovered ${discovered.length} hardware encoder(s): ${discovered.join(', ')}`);

    const benchmarked: GpuDevice[] = [];

    for (const encoderName of discovered) {
      if (encoderName.includes('qsv') || encoderName.includes('nvenc')) {
        let foundAny = false;
        // Test up to 4 potential GPUs
        for (let i = 0; i < 4; i++) {
          const fps = await this.benchmarkEncoder(encoderName, i);
          if (fps > 0) {
            console.log(`[GpuManager] Benchmark: ${encoderName} (GPU ${i}) = ${fps} fps ✓`);
            benchmarked.push({
              encoderName,
              vendor: this.resolveVendor(encoderName),
              benchmarkFps: fps,
              deviceIndex: i
            });
            foundAny = true;
          }
        }
        if (!foundAny) {
          console.log(`[GpuManager] Benchmark: ${encoderName} = FAILED (all devices) ✗`);
        }
      } else {
        const fps = await this.benchmarkEncoder(encoderName);

        if (fps > 0) {
          console.log(`[GpuManager] Benchmark: ${encoderName} = ${fps} fps ✓`);
          benchmarked.push({
            encoderName,
            vendor: this.resolveVendor(encoderName),
            benchmarkFps: fps,
          });
        } else {
          console.log(`[GpuManager] Benchmark: ${encoderName} = FAILED (excluded from pool) ✗`);
        }
      }
    }

    if (benchmarked.length === 0) {
      console.log('[GpuManager] All hardware encoders failed benchmark. Falling back to CPU (libx264).');
      this.devices = [this.createCpuFallback()];
    } else {
      // Sort by FPS descending — fastest encoder first
      this.devices = benchmarked.sort((a, b) => b.benchmarkFps - a.benchmarkFps);
      console.log(`[GpuManager] Selected primary encoder: ${this.devices[0].encoderName} (${this.devices[0].benchmarkFps} fps)`);
    }

    this.initialized = true;
  }

  /**
   * Get all available GPU devices, sorted by benchmark FPS (fastest first).
   */
  getDevices(): GpuDevice[] {
    return [...this.devices];
  }

  /**
   * Allocate a GPU for a transcoding task.
   * If preferredCodec is set (and is not 'auto'), use it directly.
   * Otherwise, return the fastest available encoder.
   */
  allocate(options: AllocateOptions = {}): GpuAllocation {
    const { preferredCodec, isFiller } = options;

    // If user explicitly chose a codec (not 'auto'), respect it
    if (preferredCodec && preferredCodec !== 'auto') {
      const device = this.devices.find(d => d.encoderName === preferredCodec);
      return {
        encoderName: preferredCodec,
        ...this.getHwaccelConfig(preferredCodec, device?.deviceIndex)
      };
    }

    // Auto mode: return the fastest available encoder
    let encoderName = 'libx264';
    let deviceIndex: number | undefined;
    
    if (this.devices.length > 0) {
      let targetIdx = 0;
      if (isFiller && this.devices.length > 1) {
        targetIdx = 1; // Use secondary GPU for background filler tasks
      }
      
      encoderName = this.devices[targetIdx].encoderName;
      deviceIndex = this.devices[targetIdx].deviceIndex;
    }

    let { hwaccelArgs, scaleFilterName } = this.getHwaccelConfig(encoderName, deviceIndex);

    return {
      encoderName,
      hwaccelArgs,
      scaleFilterName
    };
  }

  /**
   * Allocate a GPU for a specific segment index using round-robin distribution.
   * This enables the Worker Pool pattern: different segments are processed by different GPUs.
   */
  allocateForSegment(segmentIndex: number, options: AllocateOptions = {}): GpuAllocation {
    let encoderName = 'libx264';
    let deviceIndex: number | undefined;
    
    if (this.devices.length > 0) {
      // For >8K video, always use the primary (most powerful) GPU to avoid crashes on weaker integrated GPUs
      let targetDeviceIdx = segmentIndex % this.devices.length;
      if (options.resolution) {
        const width = parseInt((options.resolution as string).split('x')[0], 10);
        if (!isNaN(width) && width > 7680) {
          targetDeviceIdx = 0;
        }
      }
      
      const device = this.devices[targetDeviceIdx];
      encoderName = device.encoderName;
      deviceIndex = device.deviceIndex;
    }
    
    let { hwaccelArgs, scaleFilterName } = this.getHwaccelConfig(encoderName, deviceIndex);

    return {
      encoderName,
      hwaccelArgs,
      scaleFilterName
    };
  }

  /**
   * Determine whether using multiple GPUs (Worker Pool) would benefit
   * transcoding at a given target FPS. Returns true only if:
   * 1. There are 2+ GPU devices available
   * 2. The fastest single GPU cannot sustain the target FPS alone
   */
  canBenefitFromPool(targetFps: number): boolean {
    // Need at least 2 devices to pool
    if (this.devices.length < 2) return false;

    const best = this.devices[0];
    // If best device has 0 fps (CPU fallback) or can handle target alone — no need
    if (best.benchmarkFps <= 0 || best.benchmarkFps >= targetFps) return false;

    return true;
  }

  /**
   * Returns the number of devices available for concurrent segment processing.
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

  private createCpuFallback(): GpuDevice {
    return {
      encoderName: 'libx264',
      vendor: 'cpu',
      benchmarkFps: 0,
    };
  }
}
