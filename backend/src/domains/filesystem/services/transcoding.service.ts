import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { SettingsRepository } from '../../identity/repositories/settings.repository';
import { mkdir, access, writeFile, readFile, stat, readdir, rm } from 'fs/promises';
import { IMediaFile } from '../models/mediafile.model';
import { PlaybackProgressModel } from '../../player/models/playback-progress.model';

export class TranscodingService {
  private activeJitProcesses = new Map<string, { command: ffmpeg.FfmpegCommand, startSeconds: number }>();
  private activeFillerProcesses = new Map<string, ffmpeg.FfmpegCommand>();
  private backgroundQueue: Array<{ file: IMediaFile, quality: number, startSeconds: number, priority: number }> = [];
  private isProcessingBackgroundQueue = false;
  private MAX_BACKGROUND_PROCESSES = 2; // Maximum concurrent background fillers

  constructor(
    private repository: MediaFileRepository,
    private settingsRepository: SettingsRepository,
    private mediaRoot: string,
    private transcodeDir: string
  ) {}

  /**
   * Returns available playback qualities for a given file.
   * Always includes 'original' (native stream, no transcoding).
   * For DISK/JIT modes, includes configured target qualities that are
   * strictly less than the file's original video height.
   */
  async getAvailableQualities(id: string): Promise<{
    transcodeMode: string;
    originalHeight: number | null;
    qualities: Array<{ value: number | 'original'; label: string }>;
  }> {
    const file = await this.repository.findById(id);
    if (!file) throw new Error('File not found');

    const settings = await this.settingsRepository.getSettings();
    if (!settings) throw new Error('Settings not found');

    // Parse original height from "WxH" resolution string (e.g. "1920x1080")
    let originalHeight: number | null = null;
    const resolution = file.metadata?.resolution;
    if (resolution) {
      const parts = resolution.split('x');
      if (parts.length === 2) {
        const h = parseInt(parts[1], 10);
        if (!isNaN(h) && h > 0) originalHeight = h;
      }
    }

    const qualities: Array<{ value: number | 'original'; label: string }> = [];

    // Always offer original native stream
    const origLabel = originalHeight ? `Original (${originalHeight}p)` : 'Original';
    qualities.push({ value: 'original', label: origLabel });

    if (settings.transcodeMode !== 'OFF') {
      const targetQualities: number[] = settings.targetQualities ?? [1080, 720, 480];
      // Sort descending so the list goes high → low
      const sorted = [...targetQualities].sort((a, b) => b - a);

      for (const q of sorted) {
        // Only offer a quality that is strictly less than the original height
        // (no point upscaling; if we don't know the height, offer all)
        if (originalHeight === null || q < originalHeight) {
          qualities.push({ value: q, label: `${q}p` });
        }
      }
    }

    return {
      transcodeMode: settings.transcodeMode,
      originalHeight,
      qualities,
    };
  }

  async getHlsManifest(id: string, quality: number): Promise<string> {
    const file = await this.repository.findById(id);
    if (!file) throw new Error('File not found');

    const settings = await this.settingsRepository.getSettings();
    if (!settings) throw new Error('Settings not found');
    
    const manifestDir = path.join(this.transcodeDir, id, quality.toString());
    const manifestPath = path.join(manifestDir, `index_${quality}.m3u8`);

    try {
      await access(manifestPath);
      return manifestPath;
    } catch {
      if (settings.transcodeMode === 'OFF') {
        throw new Error('Transcoding is disabled');
      }

      await mkdir(manifestDir, { recursive: true });

      if (settings.transcodeMode === 'DISK' || settings.transcodeMode === 'JIT') {
        // Both modes now use static VOD manifest for best player compatibility (slider, duration)
        await this.generateStaticManifest(file, quality, manifestPath);
        
        // Start background transcoding from the beginning if not already running
        const processKey = `${id}_${quality}`;
        const isJitRunning = this.activeJitProcesses.has(processKey);

        if (!isJitRunning) {
          console.log(`${settings.transcodeMode}: Starting background transcode from 0s for ${file.originalName}`);
          this.startTranscoding(file, quality, settings, 0).catch(err => {
            console.error(`${settings.transcodeMode} background transcode failed:`, err);
          });
        } else {
          console.log(`${settings.transcodeMode}: Background transcode already active for ${file.originalName}`);
        }

        return manifestPath;
      }
      
      return manifestPath;
    }
  }

  private async generateStaticManifest(file: IMediaFile, quality: number, manifestPath: string): Promise<void> {
    const duration = file.metadata?.duration || 0;
    if (duration <= 0) return;

    const segmentDuration = 6;
    const segmentCount = Math.ceil(duration / segmentDuration);
    
    let content = '#EXTM3U\n';
    content += '#EXT-X-VERSION:3\n';
    content += `#EXT-X-TARGETDURATION:${segmentDuration}\n`;
    content += '#EXT-X-MEDIA-SEQUENCE:0\n';
    content += '#EXT-X-PLAYLIST-TYPE:VOD\n';

    for (let i = 0; i < segmentCount; i++) {
      const remaining = duration - (i * segmentDuration);
      const currentSegmentDuration = Math.min(segmentDuration, remaining);
      content += `#EXTINF:${currentSegmentDuration.toFixed(3)},\n`;
      content += `seg_${i.toString().padStart(3, '0')}.ts\n`;
    }

    content += '#EXT-X-ENDLIST\n';
    await writeFile(manifestPath, content);
  }

  private pendingStarts = new Map<string, number>();

  async ensureSegment(id: string, quality: number, segmentIndex: number): Promise<void> {
    const file = await this.repository.findById(id);
    if (!file) throw new Error('File not found');

    const outputDir = path.join(this.transcodeDir, id, quality.toString());
    const segmentPath = path.join(outputDir, `seg_${segmentIndex.toString().padStart(3, '0')}.ts`);
    const segmentName = `seg_${segmentIndex.toString().padStart(3, '0')}.ts`;
    const processKey = `${id}_${quality}`;

    // Quick check: if the file exists AND is confirmed complete, return immediately
    try {
      const stats = await stat(segmentPath);
      if (stats.size > 0) {
        // Verify completeness
        if (!this.activeJitProcesses.has(processKey) && stats.size > 100 * 1024) {
          return; // No process running, file is large enough — treat as complete
        }
        return;
      }
    } catch {
      // File doesn't exist yet — fall through to generation
    }

    const settings = await this.settingsRepository.getSettings();
    if (!settings) throw new Error('Settings not found');

    const playlistPath = path.join(outputDir, `jit_tmp_${quality}.m3u8`);
    let attempts = 0;
    while (attempts < 120) { // Max 30s wait (120 * 250ms)
      {
        const existing = this.activeJitProcesses.get(processKey);
        const requestedTime = segmentIndex * 6;

        // If no process OR the existing process is too far behind/ahead, restart
        if (!existing || existing.startSeconds > requestedTime || (requestedTime - existing.startSeconds) > 300) {
          // Coalescing logic: wait a bit to see if the player is just "probing"
          this.pendingStarts.set(processKey, requestedTime);
          await new Promise(resolve => setTimeout(resolve, 200));

          if (this.pendingStarts.get(processKey) === requestedTime) {
            console.log(`${settings.transcodeMode}: Segment ${segmentIndex} requested. ${existing ? 'Jumping' : 'Starting'} FFmpeg from ${requestedTime}s`);
            const promise = this.startTranscoding(file, quality, settings, requestedTime);
            
            // For DISK mode, we don't await the promise here to avoid blocking the polling loop
            if (settings.transcodeMode === 'JIT') {
              await promise;
            }
          }
        } else if (attempts % 20 === 0) {
          // Process is already running and close enough
          console.log(`${settings.transcodeMode}: Segment ${segmentIndex} requested. Using active process (start=${existing.startSeconds}s)`);
        }
      }
      
      try {
        const stats = await stat(segmentPath);
        if (stats.size > 0) {
          // 1. High-confidence check: is it in the playlist?
          const playlistContent = await readFile(playlistPath, 'utf8').catch(() => '');
          const inPlaylist = playlistContent.includes(segmentName);
          
          if (attempts % 8 === 0) {
            console.log(`JIT WAIT [${segmentName}] attempt=${attempts} size=${stats.size} inPlaylist=${inPlaylist} processActive=${this.activeJitProcesses.has(processKey)}`);
          }
          
          if (inPlaylist) {
            return;
          }

          // 2. Low-latency fallback: stability check
          if (stats.size > 100 * 1024) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const statsCheck = await stat(segmentPath).catch(() => stats);
            if (statsCheck.size === stats.size) {
              return;
            }
          }

          // 3. Process finished check (last segments)
          if (!this.activeJitProcesses.has(processKey)) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return;
          }
        }
      } catch {
        // File not found yet
      }

      const currentProcess = this.activeJitProcesses.get(processKey);
      if (!currentProcess && attempts > 20) {
        console.log(`JIT: Process for ${processKey} finished, but segment ${segmentIndex} still missing. Stopping wait.`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 250));
      attempts++;
    }
    
    // One last check before throwing
    try {
      const stats = await stat(segmentPath);
      if (stats.size > 0) return;
    } catch {
      // Ignore stat error and fall through to throw
    }

    throw new Error(`Segment ${segmentIndex} generation failed or timed out`);
  }

  async cleanupTranscode(id: string, quality?: number, userId?: string): Promise<void> {
    const targetDir = quality 
      ? path.join(this.transcodeDir, id, quality.toString())
      : path.join(this.transcodeDir, id);

    const settings = await this.settingsRepository.getSettings();
    if (!settings) throw new Error('Settings not found');

    // 1. Kill any active interactive processes for this file
    const killedKeysJit: string[] = [];
    for (const [key, proc] of this.activeJitProcesses.entries()) {
      if (key.startsWith(`${id}_`)) {
        if (!quality || key === `${id}_${quality}`) {
          proc.command.kill('SIGKILL');
          killedKeysJit.push(key);
          console.log(`JIT: Killing interactive process ${key} during cleanup`);
        }
      }
    }

    // 2. Kill any active filler processes (if JIT mode or explicit full cleanup)
    const killedKeysFiller: string[] = [];
    if (settings.transcodeMode === 'JIT') {
      for (const [key, cmd] of this.activeFillerProcesses.entries()) {
        if (key.startsWith(`${id}_`)) {
          if (!quality || key === `${id}_${quality}`) {
            cmd.kill('SIGKILL');
            killedKeysFiller.push(key);
            console.log(`JIT: Killing filler process ${key} during cleanup`);
          }
        }
      }
    }

    // 3. Wait for processes to actually stop
    if (killedKeysJit.length > 0) {
      await Promise.all(killedKeysJit.map(key => this.waitForProcessExit(key, false)));
    }
    if (killedKeysFiller.length > 0) {
      await Promise.all(killedKeysFiller.map(key => this.waitForProcessExit(key, true)));
    }

    // 4. If DISK mode, we STOP HERE. Do not delete files.
    if (settings.transcodeMode === 'DISK') {
      console.log(`DISK: Cleanup skipped for ${id} (keeping cache)`);
      return;
    }

    // 4. Handle selective cleanup for JIT mode
    try {
      // If we want to keep resume cache and we have a userId to look up progress
      if (settings.keepJitResumeCache && userId) {
        const progress = await PlaybackProgressModel.findOne({ userId, mediaId: id });
        
        if (progress && progress.currentTime > 0) {
          const startIdx = Math.floor(progress.currentTime / 6);
          const allowedSegments = [
            `seg_${startIdx.toString().padStart(3, '0')}.ts`,
            `seg_${(startIdx + 1).toString().padStart(3, '0')}.ts`,
            `seg_${(startIdx + 2).toString().padStart(3, '0')}.ts` // Keep 3 for safety (18s)
          ];

          const cleanDir = async (dirPath: string) => {
            try {
              const entries = await readdir(dirPath);
              for (const entry of entries) {
                // Keep manifest and allowed segments
                if (entry.endsWith('.m3u8') || allowedSegments.includes(entry)) {
                  continue;
                }
                await rm(path.join(dirPath, entry), { recursive: true, force: true });
              }
            } catch {
              // Ignore readdir/rm errors
            }
          };

          if (quality) {
            await cleanDir(targetDir);
          } else {
            // Clean all quality subdirectories
            const qualities = await readdir(targetDir).catch(() => []);
            for (const q of qualities) {
              await cleanDir(path.join(targetDir, q));
            }
          }
          
          console.log(`JIT: Cleaned up cache for ${id} but kept resume segments for ${progress.currentTime}s`);
          return;
        }
      }

      // Default: Full cleanup for JIT mode
      const entries = await readdir(targetDir).catch(() => []);
      for (const entry of entries) {
        await rm(path.join(targetDir, entry), { recursive: true, force: true });
      }
      console.log(`JIT: Full cleanup for ${id}`);
    } catch {
      // Directory might not exist or other FS error
    }
  }

  private async waitForProcessExit(processKey: string, isFiller: boolean = false, timeoutMs: number = 2000): Promise<void> {
    const start = Date.now();
    const map = isFiller ? this.activeFillerProcesses : this.activeJitProcesses;
    while (map.has(processKey) && (Date.now() - start) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async getEncoder(settings: any): Promise<string> {
    switch (settings.hardwareEncoder) {
      case 'nvenc': return 'h264_nvenc';
      case 'amf': return 'h264_amf';
      case 'qsv': return 'h264_qsv';
      case 'videotoolbox': return 'h264_videotoolbox';
      default: return 'libx264';
    }
  }

  private async startTranscoding(file: IMediaFile, quality: number, settings: any, startSeconds: number = 0, isFiller: boolean = false): Promise<void> {
    const processKey = `${file._id}_${quality}`;
    
    // Kill existing process of the SAME type
    const map = isFiller ? this.activeFillerProcesses : this.activeJitProcesses;
    const existing = map.get(processKey);

    if (existing) {
      if (isFiller) {
        (existing as ffmpeg.FfmpegCommand).kill('SIGKILL');
      } else {
        (existing as any).command.kill('SIGKILL');
      }
      await this.waitForProcessExit(processKey, isFiller);
    }

    const outputDir = path.join(this.transcodeDir, file._id.toString(), quality.toString());
    await mkdir(outputDir, { recursive: true });

    const fullPath = path.join(this.mediaRoot, file.path);
    const encoder = await this.getEncoder(settings);
    
    const startSegmentIndex = Math.floor(startSeconds / 6);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(fullPath)
        .inputOptions(startSeconds > 0 ? [`-ss ${startSeconds}`] : [])
        .outputOptions([
          '-c:v', encoder,
          '-preset', 'veryfast',
          '-g', '48',
          '-sc_threshold', '0',
          '-map', '0:v:0?',
          '-map', '0:a:0?',
          '-vf', `scale=-2:${quality}`,
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ac', '2',
          '-f', 'hls',
          '-hls_time', '6',
          '-hls_list_size', '0',
          '-hls_flags', 'temp_file',
          '-start_number', startSegmentIndex.toString(),
          '-output_ts_offset', startSeconds.toString(),
          '-hls_segment_filename', path.join(outputDir, 'seg_%03d.ts'),
        ])
        .on('start', () => {
          console.log(`Started ${isFiller ? 'filler' : 'interactive'} transcoding ${file.originalName} from ${startSeconds}s using ${encoder}`);
          
          // Both modes resolve immediately after launch for better responsiveness
          setTimeout(resolve, 1000);
        })
        .on('progress', () => {
          // If this is a filler, we can set priority after process has stabilized
          // Note: fluent-ffmpeg doesn't expose pid immediately in some environments
        })
        .on('error', (err) => {
          if (!err.message.includes('SIGKILL')) {
            console.error(`${isFiller ? 'FILLER' : 'JIT'} error [${encoder}]: ${err.message}`);
          }
          map.delete(processKey);
          reject(err);
        })
        .on('end', () => {
          console.log(`Finished ${isFiller ? 'filler' : 'transcoding'} ${file.originalName} to ${quality}p`);
          map.delete(processKey);
          
          // If filler finished a chunk, check if more gaps remain
          // OR if interactive finished, resume filler to fill gaps from skips
          if (settings.transcodeMode === 'DISK') {
            this.triggerBackgroundFiller(file, quality, settings, isFiller ? 0 : 1).catch(() => {});
          }
        });

      if (isFiller) {
        this.activeFillerProcesses.set(processKey, command);
      } else {
        this.activeJitProcesses.set(processKey, { command, startSeconds });
      }
      
      // Always use a temporary playlist for progress tracking
      // index_${quality}.m3u8 is our manually generated static manifest
      const tmpName = isFiller ? `filler_tmp_${quality}.m3u8` : `jit_tmp_${quality}.m3u8`;
      command.save(path.join(outputDir, tmpName));

      // Windows-specific: set low priority for filler
      if (isFiller && (command as any).ffmpegProc) {
        try {
          const pid = (command as any).ffmpegProc.pid;
          if (pid) {
            os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
          }
        } catch {
          // Ignore priority errors
        }
      }
    });
  }

  private async triggerBackgroundFiller(file: IMediaFile, quality: number, settings: any, priority: number = 0): Promise<void> {
    const processKey = `${file._id}_${quality}`;
    
    // 1. If already running, don't queue
    if (this.activeFillerProcesses.has(processKey)) return;

    // 2. If already in queue with SAME priority, don't duplicate
    const existingIdx = this.backgroundQueue.findIndex(t => t.file._id.toString() === file._id.toString() && t.quality === quality);
    if (existingIdx !== -1) {
      if (this.backgroundQueue[existingIdx].priority < priority) {
        // Upgrade priority if same task requested by interactive
        this.backgroundQueue[existingIdx].priority = priority;
        this.backgroundQueue.sort((a, b) => b.priority - a.priority);
      }
      return;
    }

    const outputDir = path.join(this.transcodeDir, file._id.toString(), quality.toString());
    const duration = file.metadata?.duration || 0;
    if (duration <= 0) return;

    const totalSegments = Math.ceil(duration / 6);
    
    // Read directory — fast filenames only
    const entries = await readdir(outputDir).catch(() => []);
    const existingIndices = new Set(
      entries
        .filter(e => e.startsWith('seg_') && e.endsWith('.ts'))
        .map(e => parseInt(e.replace('seg_', '').replace('.ts', ''), 10))
    );

    // Find the first missing segment
    let firstMissing = -1;
    for (let i = 0; i < totalSegments; i++) {
      if (!existingIndices.has(i)) {
        firstMissing = i;
        break;
      }
    }

    if (firstMissing !== -1) {
      this.backgroundQueue.push({ file, quality, startSeconds: firstMissing * 6, priority });
      // Sort: higher priority first
      this.backgroundQueue.sort((a, b) => b.priority - a.priority);
      this.processBackgroundQueue();
    }
  }

  async stopAllProcesses(): Promise<void> {
    console.log('TranscodingService: Stopping all active processes...');
    for (const proc of this.activeJitProcesses.values()) {
      proc.command.kill('SIGKILL');
    }
    for (const cmd of this.activeFillerProcesses.values()) {
      cmd.kill('SIGKILL');
    }
    this.backgroundQueue = [];
    this.activeJitProcesses.clear();
    this.activeFillerProcesses.clear();
  }

  async stopBackgroundWork(): Promise<void> {
    console.log('TranscodingService: Stopping background fillers and clearing queue...');
    for (const cmd of this.activeFillerProcesses.values()) {
      cmd.kill('SIGKILL');
    }
    this.backgroundQueue = [];
    this.activeFillerProcesses.clear();
  }

  async startProactiveTranscoding(): Promise<void> {
    const settings = await this.settingsRepository.getSettings();
    if (!settings || settings.transcodeMode !== 'DISK') return;

    if (this.isProcessingBackgroundQueue && this.backgroundQueue.some(t => t.priority === 0)) {
      console.log('DISK: Proactive transcoding already initialized and running.');
      return;
    }

    console.log('DISK: Starting proactive transcoding initialization...');
    const videoFiles = await this.repository.findAllVideoFiles();
    const qualities = settings.targetQualities || [1080, 720, 480];

    for (const file of videoFiles) {
      for (const quality of qualities) {
        // triggerBackgroundFiller will handle checking if it's already done/running
        await this.triggerBackgroundFiller(file, quality, settings, 0);
      }
    }

    console.log(`DISK: Proactive queue initialized with ${this.backgroundQueue.length} items`);
  }

  private async processBackgroundQueue(): Promise<void> {
    if (this.isProcessingBackgroundQueue) return;
    this.isProcessingBackgroundQueue = true;

    try {
      while (this.backgroundQueue.length > 0) {
        const settings = await this.settingsRepository.getSettings();
        if (!settings || settings.transcodeMode !== 'DISK') {
          this.backgroundQueue = [];
          break;
        }

        // Check concurrency
        if (this.activeFillerProcesses.size >= this.MAX_BACKGROUND_PROCESSES) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        const task = this.backgroundQueue.shift()!;
        const processKey = `${task.file._id}_${task.quality}`;

        // If an interactive process is already running for this file/quality, skip it for now
        if (this.activeJitProcesses.has(processKey)) {
          console.log(`DISK: Skipping background filler for ${task.file.originalName} (${task.quality}p) - interactive active`);
          continue;
        }

        console.log(`DISK: Starting background filler: ${task.file.originalName} (${task.quality}p) from ${task.startSeconds}s (Priority: ${task.priority})`);
        
        // startTranscoding will add it to activeFillerProcesses
        await this.startTranscoding(task.file, task.quality, settings, task.startSeconds, true).catch(() => {});

        // Brief delay before starting next one to avoid CPU spikes
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally {
      this.isProcessingBackgroundQueue = false;
    }
  }
}
