import { writeFile, mkdir, rm, rename, access, readdir } from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { SettingsRepository } from '../../identity/repositories/settings.repository';
import { ScannerService } from './scanner.service';
import { JwtUser, MultipartFile, FileFilters } from '../types';
import { IMediaFile } from '../models/mediafile.model';
import { getErrorCode, getErrorMessage } from '../../../shared/utils/error.util';

export class FileService {
  constructor(
    private repository: MediaFileRepository, 
    private settingsRepository: SettingsRepository,
    private scannerService: ScannerService,
    private defaultMediaRoot: string
  ) {}

  private async getMediaRoot(): Promise<string> {
    const settings = await this.settingsRepository.getSettings();
    return settings?.mediaRootDirectory || this.defaultMediaRoot;
  }

  private async getPhysicalPath(mediaFile: IMediaFile): Promise<string> {
    const root = await this.getMediaRoot();
    return path.join(root, mediaFile.path);
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async retryRename(oldPath: string, newPath: string, retries = 5, delay = 100): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await rename(oldPath, newPath);
        return;
      } catch (err: unknown) {
        const code = getErrorCode(err);
        if ((code === 'EPERM' || code === 'EBUSY') && i < retries - 1) {
          console.warn(`File busy, retrying rename (${i + 1}/${retries}): ${oldPath}`);
          await this.sleep(delay * Math.pow(2, i)); // Exponential backoff
          continue;
        }
        throw err;
      }
    }
  }

  private async retryDelete(physicalPath: string, retries = 5, delay = 100): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await rm(physicalPath, { recursive: true, force: true });
        return;
      } catch (err: unknown) {
        const code = getErrorCode(err);
        if ((code === 'EPERM' || code === 'EBUSY') && i < retries - 1) {
          console.warn(`Path busy, retrying delete (${i + 1}/${retries}): ${physicalPath}`);
          await this.sleep(delay * Math.pow(2, i));
          continue;
        }
        throw err;
      }
    }
  }

  private async safeMoveDirectory(oldPhysicalPath: string, newPhysicalPath: string): Promise<void> {
    await mkdir(newPhysicalPath, { recursive: true });
    const entries = await readdir(oldPhysicalPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const src = path.join(oldPhysicalPath, entry.name);
      const dest = path.join(newPhysicalPath, entry.name);
      
      if (entry.isDirectory()) {
        await this.safeMoveDirectory(src, dest);
      } else {
        await this.retryRename(src, dest);
      }
    }
  }

  private normalizePath(p: string): string {
    return p.split(path.sep).join('/');
  }

  async uploadFile(file: MultipartFile, user: JwtUser, parentId?: string): Promise<IMediaFile> {
    const mediaRoot = await this.getMediaRoot();
    const originalName = file.filename;
    const sanitizedName = sanitize(originalName);
    const savedName = sanitizedName;
    
    let relativePath = savedName;
    if (parentId && parentId !== 'root') {
      const parent = await this.repository.findById(parentId);
      if (parent && parent.isFolder) {
        relativePath = path.join(parent.path, savedName);
      }
    }

    const filePath = path.join(mediaRoot, relativePath);
    
    // Path Jail Check
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(mediaRoot);
    const relative = path.relative(resolvedRoot, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Security: Invalid file path');
    }

    const fileContent = await file.toBuffer();
    await writeFile(filePath, fileContent);

    const mediaFile = await this.repository.create({
      originalName,
      savedName,
      path: relativePath,
      mimeType: file.mimetype,
      size: fileContent.length,
      uploadedBy: user.id,
      parentId: parentId === 'root' ? null : parentId,
      isFolder: false,
    });

    return mediaFile;
  }

  async createFolder(name: string, parentId: string | null, user: JwtUser): Promise<IMediaFile> {
    const mediaRoot = await this.getMediaRoot();
    const sanitizedName = sanitize(name);
    const savedFolderName = sanitizedName;
    
    let relativePath = savedFolderName;
    if (parentId && parentId !== 'root') {
      const parent = await this.repository.findById(parentId);
      if (parent && parent.isFolder) {
        relativePath = path.join(parent.path, savedFolderName);
      }
    }

    const folderPath = path.join(mediaRoot, relativePath);
    await mkdir(folderPath, { recursive: true });

    return this.repository.create({
      originalName: name,
      savedName: savedFolderName,
      path: relativePath,
      mimeType: 'directory',
      size: 0,
      uploadedBy: user.id,
      parentId: parentId === 'root' ? null : parentId,
      isFolder: true,
    });
  }

  async getFiles(filters: FileFilters = {}): Promise<{ items: IMediaFile[], total: number }> {
    const queryFilters: Record<string, unknown> = { ...filters }; // repository needs internal shape
    if (filters.parentId !== undefined) {
      if (filters.parentId === 'root' || !filters.parentId) {
        queryFilters.parentPath = null; // root level
      } else {
        const parent = await this.repository.findById(filters.parentId);
        if (parent) queryFilters.parentPath = parent.path;
      }
      delete queryFilters.parentId;
    }
    return this.repository.findAll(queryFilters as Record<string, unknown>);
  }

  async renameFile(id: string, newName: string, user: JwtUser): Promise<IMediaFile | null> {
    const mediaFile = await this.repository.findById(id);
    if (!mediaFile) throw new Error('File not found');

    if (user.role !== 'admin' && mediaFile.uploadedBy.toString() !== user.id) {
      throw new Error('Forbidden: You can only rename your own files');
    }

    const sanitizedName = sanitize(newName);
    
    const dirName = path.dirname(mediaFile.path);
    const newRelativePath = this.normalizePath(path.join(dirName, sanitizedName));
    
    // Check if target already exists in DATABASE
    const existingInDb = await this.repository.findByPath(newRelativePath);
    if (existingInDb) {
      throw new Error('Target path already exists in database');
    }

    await this.performMoveOperation(mediaFile, newRelativePath);

    return this.repository.update(id, { 
      originalName: newName,
      savedName: sanitizedName,
      path: newRelativePath
    });
  }

  async moveFiles(ids: string[], targetParentId: string | null, user: JwtUser): Promise<void> {
    let targetRelativePath = '';
    if (targetParentId && targetParentId !== 'root') {
      const targetParent = await this.repository.findById(targetParentId);
      if (!targetParent || !targetParent.isFolder) throw new Error('Target is not a folder');
      targetRelativePath = targetParent.path;
    }

    // Filter out IDs that are children of other IDs in the selection
    const selectedFiles = await Promise.all(ids.map(id => this.repository.findById(id)));
    const validFiles = selectedFiles.filter((f): f is IMediaFile => f !== null);
    const topLevelFiles = validFiles.filter(file => {
      const thisPath = this.normalizePath(file.path);
      return !validFiles.some(other => {
        const otherPath = this.normalizePath(other.path);
        return other._id.toString() !== file._id.toString() && 
               other.isFolder && 
               thisPath.startsWith(otherPath + '/');
      });
    });

    for (const file of topLevelFiles) {
      // RBAC check: Only admin or owner can move
      if (user.role !== 'admin' && file.uploadedBy.toString() !== user.id) {
        console.warn(`Permission denied: Cannot move file ${file.originalName}`);
        continue;
      }

      const id = file._id.toString();
      const newRelativePath = this.normalizePath(path.join(targetRelativePath, file.savedName));

      // Check if target path already exists in DATABASE
      const existingInDb = await this.repository.findByPath(newRelativePath);
      if (existingInDb) {
        console.warn(`Target path already exists in database, skipping move for: ${file.originalName}`);
        continue;
      }

      await this.performMoveOperation(file, newRelativePath);

      await this.repository.update(id, { 
        parentId: targetParentId === 'root' ? null : targetParentId,
        path: newRelativePath
      });
    }
  }

  private async performMoveOperation(mediaFile: IMediaFile, newRelativePath: string): Promise<void> {
    const mediaRoot = await this.getMediaRoot();
    const oldRelativePath = this.normalizePath(mediaFile.path);
    const oldPhysicalPath = path.join(mediaRoot, oldRelativePath);
    const newPhysicalPath = path.join(mediaRoot, newRelativePath);

    // Security & collisions
    const resolvedNewPath = path.resolve(newPhysicalPath);
    const resolvedRoot = path.resolve(mediaRoot);
    if (!resolvedNewPath.startsWith(resolvedRoot)) {
      throw new Error('Security: Invalid target path');
    }

    try {
      await access(newPhysicalPath);
      throw new Error('Target already exists on disk');
    } catch (err: unknown) {
      if (getErrorMessage(err) === 'Target already exists on disk') throw err;
    }

    // 1. Suspend Watcher
    await this.scannerService.unwatch(oldRelativePath);
    await this.scannerService.unwatch(newRelativePath);

    try {
      // 2. Physical Move
      if (mediaFile.isFolder) {
        await this.safeMoveDirectory(oldPhysicalPath, newPhysicalPath);
        // After deep move, cleanup the old structure
        await this.retryDelete(oldPhysicalPath);
      } else {
        await this.retryRename(oldPhysicalPath, newPhysicalPath);
      }

      // 3. Recursive DB Update (to preserve ownership/metadata)
      if (mediaFile.isFolder) {
        const children = await this.repository.findByPathPrefix(oldRelativePath);
        for (const child of children) {
          const normalizedChildPath = this.normalizePath(child.path);
          if (normalizedChildPath.startsWith(oldRelativePath + '/')) {
            const childNewPath = newRelativePath + normalizedChildPath.substring(oldRelativePath.length);
            await this.repository.update(child._id.toString(), { path: childNewPath });
          }
        }
      }
    } finally {
      // 4. Resume Watcher
      await this.scannerService.watch(newRelativePath);
    }
  }

  async updateTags(ids: string[], tags: string[], user: JwtUser): Promise<void> {
    for (const id of ids) {
      const file = await this.repository.findById(id);
      if (!file) continue;
      if (user.role !== 'admin' && file.uploadedBy.toString() !== user.id) continue;
      
      await this.repository.update(id, { tags });
    }
  }

  async deleteFiles(ids: string[], user: JwtUser): Promise<void> {
    const mediaRoot = await this.getMediaRoot();
    for (const id of ids) {
      const mediaFile = await this.repository.findById(id);
      if (!mediaFile) continue;

      if (user.role !== 'admin' && mediaFile.uploadedBy.toString() !== user.id) continue;

      const physicalPath = path.join(mediaRoot, mediaFile.path);
      try {
        await rm(physicalPath, { recursive: true, force: true });
      } catch (err: unknown) {
        if (getErrorCode(err) === 'EPERM' || getErrorCode(err) === 'EBUSY') {
          throw new Error('File or folder is busy', { cause: err });
        }
        console.error(`Failed to delete physical path: ${physicalPath}`, err);
      }

      // Recursive DB deletion for all descendants
      if (mediaFile.isFolder) {
        await this.repository.deleteByPathPrefix(mediaFile.path);
      }
      
      await this.repository.delete(id);
    }
  }
}
