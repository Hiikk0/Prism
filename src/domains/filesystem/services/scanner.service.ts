import path from 'path';
import { loadEsm } from 'load-esm';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { MediaProcessorService } from './media-processor.service';
import { generateFastHash } from '../utils/hash.util';
import sanitize from 'sanitize-filename';
import fs from 'fs/promises';

export class ScannerService {
  private watcher: any = null;

  constructor(
    private repository: MediaFileRepository,
    private processor: MediaProcessorService,
    private mediaRoot: string
  ) {}

  async initialize(): Promise<void> {
    const chokidar = await loadEsm<typeof import('chokidar')>('chokidar');
    
    // Configure Chokidar with basic path jail
    this.watcher = chokidar.watch(this.mediaRoot, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: false,
      depth: 20 // SSoT: Max depth as safeguard
    });

    this.watcher
      .on('add', this.handleAdd.bind(this))
      .on('unlink', this.handleRemove.bind(this));
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
      if (stats.isDirectory()) return; // Chokidar handles directory events differently if needed

      const originalName = path.basename(resolvedPath);
      const hash = await generateFastHash(resolvedPath);
      const relativePath = path.relative(this.mediaRoot, resolvedPath);

      // Deduplication Check
      const existingFiles = await this.repository.findAll({ hash });
      if (existingFiles.length > 0) {
        console.log(`DEDUPLICATION: Found existing file for ${originalName} (hash: ${hash}). Skipping process.`);
        return;
      }

      // Detect MIME Type (basic by extension)
      const mimeType = this.mimeFromExtension(originalName);

      const mediaFile = await this.repository.create({
        originalName,
        savedName: originalName, // For scanned files, savedName = originalName usually
        path: relativePath,
        mimeType,
        size: stats.size,
        hash,
        uploadedBy: null, // Scanned files by default have no manual owner
      });

      // Trigger metadata extraction
      if (mediaFile) {
        await this.processor.processFile(mediaFile._id.toString());
      }
    } catch (err) {
      console.error(`ERROR in handleAdd for ${filePath}:`, err);
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
