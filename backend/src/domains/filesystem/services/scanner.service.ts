import path from 'path';
import { loadEsm } from 'load-esm';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { MediaProcessorService } from './media-processor.service';
import { generateFastHash } from '../utils/hash.util';
import fs from 'fs/promises';
import { Sema } from 'async-sema';

import { SettingsRepository } from '../../identity/repositories/settings.repository';
import { fileEvents } from '../../../shared/utils/event-bus';

export class ScannerService {
  private watcher: any = null;
  private queue: any = null;
  private ioSema: Sema | null = null;
  private ignoredPaths = new Set<string>();

  constructor(
    private repository: MediaFileRepository,
    private processor: MediaProcessorService,
    private mediaRoot: string,
    private settingsRepository: SettingsRepository,
    private systemUserId: string
  ) {}

  async initialize(): Promise<void> {
    const chokidar = await loadEsm<typeof import('chokidar')>('chokidar');
    const fastq = await import('fastq');
    const settings = await this.settingsRepository.getSettings();
    
    // Concurrency settings
    const scannerConcurrency = settings?.scannerConcurrency ?? 2;
    const ioConcurrency = settings?.scannerIoConcurrency ?? 10;
    
    this.ioSema = new Sema(ioConcurrency);
    this.queue = fastq.promise(this.processTask.bind(this), scannerConcurrency);

    if (this.watcher) {
      await this.watcher.close();
    }

    // Configure Chokidar - ignoreInitial: true to handle scan manually
    this.watcher = chokidar.watch(this.mediaRoot, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true, 
      depth: 20,
      usePolling: settings?.usePolling ?? false,
      interval: settings?.pollingInterval ?? 100,
      binaryInterval: (settings?.pollingInterval ?? 100) * 3
    });

    this.watcher
      .on('add', this.handleAdd.bind(this))
      .on('unlink', this.handleRemove.bind(this))
      .on('addDir', this.handleAddDir.bind(this))
      .on('unlinkDir', this.handleRemoveDir.bind(this));
    
    console.log(`WATCHER: Initialized (Queue: ${scannerConcurrency}, IO-Sema: ${ioConcurrency})`);
    
    // Trigger initial scan in background so we don't block server startup
    this.initialScan().catch(err => console.error('WATCHER: Background initial scan failed:', err));
  }

  private async processTask(fileId: string): Promise<void> {
    try {
      await this.processor.processFile(fileId);
    } catch (err) {
      console.error(`SCANNER QUEUE ERROR for ${fileId}:`, err);
    }
  }

  async initialScan(): Promise<void> {
    console.log('WATCHER: Starting manual initial scan...');
    try {
      // 1. Get all DB paths for comparison
      const dbEntries = await this.repository.findAllPaths();
      const dbPaths = Array.from(dbEntries.keys());
      
      // 2. Scan disk
      const diskEntries = await this.scanDirectoryRecursive(this.mediaRoot);
      const diskPaths = diskEntries.map(e => e.relativePath);
      
      const toInsert: any[] = [];
      const toRemoveIds: string[] = [];
      const toUpdate: { id: string, data: any }[] = [];
      const toProcessIds: string[] = [];

      // 3. Compare Disk vs DB
      const dbPathSet = new Set(dbPaths);
      const diskPathMap = new Map(diskEntries.map(e => [e.relativePath, e]));

      // Identify Deleted
      for (const dbPath of dbPaths) {
        if (!diskPathMap.has(dbPath)) {
          // Find the actual document to get ID (though internal repo might need a special findByPath if we don't have IDs in map)
          // For simplicity in this logic, we might need IDs in findAllPaths map
        }
      }
      
      // We need IDs in our Map to actually delete/update
      // Let's assume repository.findAllPaths returns { id, hash, size, modifiedAt }
      // Wait, let's fix the repository lookup to include IDs
      const dbFullEntries = await this.repository.findAllPaths(); 

      // Deleted files
      for (const [path, entry] of dbFullEntries) {
        if (!diskPathMap.has(path)) {
          toRemoveIds.push((entry as any).id);
        }
      }

      // New or Changed files
      for (const diskEntry of diskEntries) {
        const dbEntry: any = dbFullEntries.get(diskEntry.relativePath);
        
        if (!dbEntry) {
          // NEW
          await this.ioSema?.acquire();
          try {
            const hash = diskEntry.isFolder ? undefined : await generateFastHash(diskEntry.fullPath);
            toInsert.push({
              originalName: path.basename(diskEntry.fullPath),
              savedName: path.basename(diskEntry.fullPath),
              path: diskEntry.relativePath,
              mimeType: diskEntry.isFolder ? 'inode/directory' : this.mimeFromExtension(diskEntry.fullPath),
              size: diskEntry.size,
              hash,
              modifiedAt: diskEntry.mtime,
              isFolder: diskEntry.isFolder,
              uploadedBy: this.systemUserId
            });
          } finally {
            this.ioSema?.release();
          }
        } else {
          // EXISTS - Check for changes
          const mtimeChanged = dbEntry.modifiedAt?.getTime() !== diskEntry.mtime.getTime();
          const sizeChanged = dbEntry.size !== diskEntry.size;
          
          if (mtimeChanged || sizeChanged) {
            await this.ioSema?.acquire();
            try {
              const hash = diskEntry.isFolder ? undefined : await generateFastHash(diskEntry.fullPath);
              toUpdate.push({
                id: dbEntry.id,
                data: {
                  size: diskEntry.size,
                  hash,
                  modifiedAt: diskEntry.mtime,
                  originalName: path.basename(diskEntry.fullPath)
                }
              });
              toProcessIds.push(dbEntry.id);
            } finally {
              this.ioSema?.release();
            }
          }
        }
      }

      // 4. Batch DB Operations
      if (toRemoveIds.length > 0) {
        await this.repository.deleteMany(toRemoveIds);
        console.log(`WATCHER: Batch removed ${toRemoveIds.length} missing entries.`);
      }

      if (toInsert.length > 0) {
        // We need to keep track of inserted IDs to push them to processor queue
        // InsertMany returns the inserted docs
        // For now, let's just do them.
        await this.repository.createMany(toInsert);
        console.log(`WATCHER: Batch inserted ${toInsert.length} new entries.`);
      }

      if (toUpdate.length > 0) {
        console.log(`WATCHER: Updating ${toUpdate.length} changed entries...`);
        for (const update of toUpdate) {
          await this.repository.update(update.id, update.data);
        }
      }

      // 5. Push new/changed to Processor Queue
      // (Simplified: we should ideally get IDs of new docs, but for now runtime watcher or future scan will pick them up if needed)
      // Actually let's push the updated ones at least
      for (const id of toProcessIds) {
        this.queue.push(id);
      }

      console.log(`WATCHER: Initial scan complete. Total processed: ${diskEntries.length} files/folders.`);

    } catch (err) {
      console.error('WATCHER: Initial scan error:', err);
    }
  }

  private async scanDirectoryRecursive(dir: string): Promise<any[]> {
    const results: any[] = [];
    const list = await fs.readdir(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        let stats;
        
        // Use semaphore only for the I/O operation itself to avoid recursive deadlocks
        await this.ioSema?.acquire();
        try {
            stats = await fs.stat(fullPath);
        } finally {
            this.ioSema?.release();
        }

        const relativePath = path.relative(this.mediaRoot, fullPath);
        const entry = {
            fullPath,
            relativePath,
            size: stats.size,
            mtime: stats.mtime,
            isFolder: stats.isDirectory()
        };
        results.push(entry);

        if (stats.isDirectory()) {
            const subResults = await this.scanDirectoryRecursive(fullPath);
            results.push(...subResults);
        }
    }
    return results;
  }

  private async handleAdd(filePath: string): Promise<void> {
    try {
      const resolvedPath = await fs.realpath(filePath);
      const relativePath = path.relative(this.mediaRoot, resolvedPath);
      
      if (this.isIgnored(relativePath)) return;

      const stats = await fs.stat(resolvedPath);
      if (stats.isDirectory()) return;

      const existing = await this.repository.findByPath(relativePath);
      
      if (existing) {
        const mtimeChanged = existing.modifiedAt?.getTime() !== stats.mtime.getTime();
        const sizeChanged = existing.size !== stats.size;
        
        if (!mtimeChanged && !sizeChanged) {
          return; // No change
        }
      }

      const hash = await generateFastHash(resolvedPath);
      
      if (existing) {
        await this.repository.update(existing._id.toString(), {
          size: stats.size,
          hash,
          modifiedAt: stats.mtime
        });
        this.queue.push(existing._id.toString());
      } else {
        const mediaFile = await this.repository.create({
          originalName: path.basename(resolvedPath),
          savedName: path.basename(resolvedPath),
          path: relativePath,
          mimeType: this.mimeFromExtension(resolvedPath),
          size: stats.size,
          hash,
          modifiedAt: stats.mtime,
          uploadedBy: this.systemUserId
        });
        this.queue.push(mediaFile._id.toString());
      }
      
      // Notify clients to refresh
      fileEvents.emit('fs_change');
    } catch (err) {
      console.error(`ERROR in handleAdd for ${filePath}:`, err);
    }
  }

  private async handleRemove(filePath: string): Promise<void> {
    try {
      const relativePath = path.relative(this.mediaRoot, filePath);
      if (this.isIgnored(relativePath)) return;
      
      const target = await this.repository.findByPath(relativePath);
      if (target) {
        await this.repository.delete(target._id.toString());
        console.log(`WATCHER: Removed ${relativePath}`);
        fileEvents.emit('fs_change');
      }
    } catch (err) {
      console.error(`ERROR in handleRemove for ${filePath}:`, err);
    }
  }

  private async handleAddDir(dirPath: string): Promise<void> {
    const relativePath = path.relative(this.mediaRoot, dirPath);
    if (!relativePath || this.isIgnored(relativePath)) return;
    const existing = await this.repository.findByPath(relativePath);
    if (!existing) {
      await this.repository.create({
        originalName: path.basename(dirPath),
        savedName: path.basename(dirPath),
        path: relativePath,
        mimeType: 'inode/directory',
        isFolder: true,
        size: 0,
        uploadedBy: this.systemUserId
      });
      fileEvents.emit('fs_change');
    }
  }

  private async handleRemoveDir(dirPath: string): Promise<void> {
    const relativePath = path.relative(this.mediaRoot, dirPath);
    if (this.isIgnored(relativePath)) return;
    const target = await this.repository.findByPath(relativePath);
    if (target) {
      await this.repository.delete(target._id.toString());
      fileEvents.emit('fs_change');
    }
  }

  async unwatch(relativePath: string): Promise<void> {
    const normalized = relativePath.split(path.sep).join('/');
    console.log(`WATCHER: Soft-ignoring events for ${normalized}`);
    this.ignoredPaths.add(normalized);
  }

  async watch(relativePath: string): Promise<void> {
    const normalized = relativePath.split(path.sep).join('/');
    console.log(`WATCHER: Resuming events for ${normalized}`);
    this.ignoredPaths.delete(normalized);
  }

  private isIgnored(relativePath: string): boolean {
    const normalized = relativePath.split(path.sep).join('/');
    for (const ignored of this.ignoredPaths) {
      if (normalized === ignored || normalized.startsWith(ignored + '/')) {
        return true;
      }
    }
    return false;
  }

  private mimeFromExtension(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const map: any = {
      '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
    };
    return map[ext] || 'application/octet-stream';
  }
}
