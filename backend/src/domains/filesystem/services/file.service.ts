import { unlink, writeFile, mkdir, rm, rename } from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { SettingsRepository } from '../../identity/repositories/settings.repository';

export class FileService {
  constructor(
    private repository: MediaFileRepository, 
    private settingsRepository: SettingsRepository,
    private defaultMediaRoot: string
  ) {}

  private async getMediaRoot(): Promise<string> {
    const settings = await this.settingsRepository.getSettings();
    return settings?.mediaRootDirectory || this.defaultMediaRoot;
  }

  private async getPhysicalPath(mediaFile: any): Promise<string> {
    const root = await this.getMediaRoot();
    return path.join(root, mediaFile.path);
  }

  async uploadFile(file: any, user: any, parentId?: string): Promise<any> {
    const mediaRoot = await this.getMediaRoot();
    const originalName = file.filename;
    const sanitizedName = sanitize(originalName);
    const savedName = `${Date.now()}-${sanitizedName}`;
    
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
      uploadedBy: user.id || user._id,
      parentId: parentId === 'root' ? null : parentId,
      isFolder: false,
    });

    return mediaFile;
  }

  async createFolder(name: string, parentId: string | null, user: any): Promise<any> {
    const mediaRoot = await this.getMediaRoot();
    const sanitizedName = sanitize(name);
    const savedFolderName = `${Date.now()}-${sanitizedName}`;
    
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
      uploadedBy: user.id || user._id,
      parentId: parentId === 'root' ? null : parentId,
      isFolder: true,
    });
  }

  async getFiles(filters: any = {}): Promise<any[]> {
    return this.repository.findAll(filters);
  }

  async renameFile(id: string, newName: string, user: any): Promise<any> {
    const mediaFile = await this.repository.findById(id);
    if (!mediaFile) throw new Error('File not found');

    if (user.role !== 'admin' && mediaFile.uploadedBy.toString() !== (user.id || user._id).toString()) {
      throw new Error('Forbidden: You can only rename your own files');
    }

    const mediaRoot = await this.getMediaRoot();
    const sanitizedName = sanitize(newName);
    
    // Physical Rename
    const oldPhysicalPath = path.join(mediaRoot, mediaFile.path);
    const dirName = path.dirname(mediaFile.path);
    const newRelativePath = path.join(dirName, sanitizedName);
    const newPhysicalPath = path.join(mediaRoot, newRelativePath);

    // Path Jail Check for new path
    const resolvedNewPath = path.resolve(newPhysicalPath);
    const resolvedRoot = path.resolve(mediaRoot);
    if (!resolvedNewPath.startsWith(resolvedRoot)) {
      throw new Error('Security: Invalid rename target path');
    }

    await rename(oldPhysicalPath, newPhysicalPath);

    // If it's a folder, we MUST update all children's paths
    if (mediaFile.isFolder) {
      const children = await this.repository.findAll({ path: { $regex: `^${mediaFile.path}/` } });
      for (const child of children) {
        const childNewPath = child.path.replace(mediaFile.path, newRelativePath);
        await this.repository.update(child._id.toString(), { path: childNewPath });
      }
    }

    return this.repository.update(id, { 
      originalName: newName,
      path: newRelativePath
    });
  }

  async moveFiles(ids: string[], targetParentId: string | null, user: any): Promise<void> {
    const mediaRoot = await this.getMediaRoot();
    let targetRelativePath = '';
    if (targetParentId && targetParentId !== 'root') {
      const targetParent = await this.repository.findById(targetParentId);
      if (!targetParent || !targetParent.isFolder) throw new Error('Target is not a folder');
      targetRelativePath = targetParent.path;
    }

    for (const id of ids) {
      const file = await this.repository.findById(id);
      if (!file) continue;

      // RBAC
      if (user.role !== 'admin' && file.uploadedBy.toString() !== (user.id || user._id).toString()) continue;

      const oldPhysicalPath = path.join(mediaRoot, file.path);
      const newRelativePath = path.join(targetRelativePath, file.savedName);
      const newPhysicalPath = path.join(mediaRoot, newRelativePath);

      await rename(oldPhysicalPath, newPhysicalPath);
      await this.repository.update(id, { 
        parentId: targetParentId === 'root' ? null : targetParentId,
        path: newRelativePath 
      });
    }
  }

  async updateTags(ids: string[], tags: string[], user: any): Promise<void> {
    for (const id of ids) {
      const file = await this.repository.findById(id);
      if (!file) continue;
      if (user.role !== 'admin' && file.uploadedBy.toString() !== (user.id || user._id).toString()) continue;
      
      await this.repository.update(id, { tags });
    }
  }

  async deleteFiles(ids: string[], user: any): Promise<void> {
    const mediaRoot = await this.getMediaRoot();
    for (const id of ids) {
      const mediaFile = await this.repository.findById(id);
      if (!mediaFile) continue;

      if (user.role !== 'admin' && mediaFile.uploadedBy.toString() !== (user.id || user._id).toString()) continue;

      const physicalPath = path.join(mediaRoot, mediaFile.path);
      try {
        await rm(physicalPath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete physical path: ${physicalPath}`, err);
      }
      await this.repository.delete(id);
    }
  }
}
