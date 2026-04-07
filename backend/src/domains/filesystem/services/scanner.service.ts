import path from 'path';
import { loadEsm } from 'load-esm';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { MediaProcessorService } from './media-processor.service';
import { generateFastHash } from '../utils/hash.util';
import sanitize from 'sanitize-filename';
import fs from 'fs/promises';

import { SettingsRepository } from '../../identity/repositories/settings.repository';

export class ScannerService {
  private watcher: any = null;

  constructor(
    private repository: MediaFileRepository,
    private processor: MediaProcessorService,
    private mediaRoot: string,
    private settingsRepository: SettingsRepository,
    private systemUserId: string
  ) {}

  async initialize(): Promise<void> {
    const chokidar = await loadEsm<typeof import('chokidar')>('chokidar');
    const settings = await this.settingsRepository.getSettings();
    
    if (this.watcher) {
      await this.watcher.close();
    }

    // Configure Chokidar with basic path jail and polling settings
    this.watcher = chokidar.watch(this.mediaRoot, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: false, // This performs the "full scan" at start
      depth: 20, // SSoT: Max depth as safeguard
      usePolling: settings?.usePolling ?? false,
      interval: settings?.pollingInterval ?? 100,
      binaryInterval: (settings?.pollingInterval ?? 100) * 3
    });

    this.watcher
      .on('add', this.handleAdd.bind(this))
      .on('unlink', this.handleRemove.bind(this))
      .on('addDir', this.handleAddDir.bind(this))
      .on('unlinkDir', this.handleRemoveDir.bind(this));
    
    console.log(`WATCHER: Initialized for ${this.mediaRoot} (Polling: ${settings?.usePolling ?? false})`);
  }

  async fullScan(): Promise<void> {
    // For chokidar, full scan is effectively a restart with ignoreInitial: false
    await this.initialize();
  }

  async restartWatcher(newRoot?: string): Promise<void> {
    if (newRoot) this.mediaRoot = newRoot;
    await this.initialize();
  }

  private async handleAdd(filePath: string): Promise<void> {
    try {
      const resolvedPath = await fs.realpath(filePath);
      
      // Path Jail Check
      if (!resolvedPath.startsWith(path.resolve(this.mediaRoot))) {
        console.warn(`SECURITY: Blocked scan for file outside root: ${resolvedPath}`);
        return;
      }

      const stats = await fs.stat(resolvedPath);
      if (stats.isDirectory()) return;

      const originalName = path.basename(resolvedPath);
      const hash = await generateFastHash(resolvedPath);
      const relativePath = path.relative(this.mediaRoot, resolvedPath);

      // EXTERNAL RENAME/MOVE DETECTION
      const existingByHash = await this.repository.findAll({ hash });
      if (existingByHash.length > 0) {
        const matchingFile = existingByHash[0];
        if (matchingFile.path !== relativePath) {
          console.log(`WATCHER: Detected external move/rename. Updating path for ${matchingFile.originalName}: ${matchingFile.path} -> ${relativePath}`);
          await this.repository.update(matchingFile._id.toString(), { 
            path: relativePath,
            originalName: originalName // Update original name too if it changed
          });
          return;
        }
        console.log(`DEDUPLICATION: Found existing file for ${originalName} (hash: ${hash}). Skipping process.`);
        return;
      }

      // Detect MIME Type
      const mimeType = this.mimeFromExtension(originalName);

      const mediaFile = await this.repository.create({
        originalName,
        savedName: originalName,
        path: relativePath,
        mimeType,
        size: stats.size,
        hash,
        uploadedBy: this.systemUserId as any, // Assigned to System User
      });

      if (mediaFile) {
        await this.processor.processFile(mediaFile._id.toString());
      }
    } catch (err) {
      console.error(`ERROR in handleAdd for ${filePath}:`, err);
    }
  }

  private async handleAddDir(dirPath: string): Promise<void> {
    try {
      const relativePath = path.relative(this.mediaRoot, dirPath);
      if (!relativePath) return; // ignore root

      const existing = await this.repository.findAll({ path: relativePath, isFolder: true });
      if (existing.length === 0) {
        await this.repository.create({
          originalName: path.basename(dirPath),
          savedName: path.basename(dirPath),
          path: relativePath,
          mimeType: 'inode/directory',
          size: 0,
          isFolder: true,
          uploadedBy: this.systemUserId as any
        });
        console.log(`WATCHER: Added directory ${relativePath}`);
      }
    } catch (err) {
      console.error(`ERROR in handleAddDir for ${dirPath}:`, err);
    }
  }

  private async handleRemoveDir(dirPath: string): Promise<void> {
    try {
      const relativePath = path.relative(this.mediaRoot, dirPath);
      const existing = await this.repository.findAll({ path: relativePath, isFolder: true });
      if (existing.length > 0) {
        await this.repository.delete(existing[0]._id.toString());
        console.log(`WATCHER: Removed directory ${relativePath}`);
      }
    } catch (err) {
      console.error(`ERROR in handleRemoveDir for ${dirPath}:`, err);
    }
  }

  private async handleRemove(filePath: string): Promise<void> {
    try {
       const relativePath = path.relative(this.mediaRoot, filePath);
       // Find file by path and delete
       const files = await this.repository.findAll({}); // Generic search for now
       const target = files.find(f => f.path === relativePath);
       if (target) {
         await this.repository.delete(target._id.toString());
         console.log(`WATCHER: Removed file ${relativePath} from DB.`);
       }
    } catch (err) {
      console.error(`ERROR in handleRemove for ${filePath}:`, err);
    }
  }

  private mimeFromExtension(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const map: any = {
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.mp3': 'audio/mpeg',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    return map[ext] || 'application/octet-stream';
  }
}
