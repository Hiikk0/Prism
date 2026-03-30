import { unlink, writeFile } from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';
import { MediaFileRepository } from '../repositories/mediafile.repository';

export class FileService {
  constructor(private repository: MediaFileRepository, private mediaRoot: string) {}

  async uploadFile(file: any, user: any): Promise<any> {
    const originalName = file.filename;
    const sanitizedName = sanitize(originalName);
    const savedName = `${Date.now()}-${sanitizedName}`;
    const filePath = path.join(this.mediaRoot, savedName);
    
    // Path Jail Check (Prevent Path Traversal)
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(this.mediaRoot))) {
      throw new Error('Security: Invalid file path');
    }

    const fileContent = await file.toBuffer();
    await writeFile(filePath, fileContent);

    const mediaFile = await this.repository.create({
      originalName,
      savedName,
      path: savedName, // SSoT: Абсолютний або відносний шлях у MEDIA_ROOT_DIRECTORY
      mimeType: file.mimetype,
      size: fileContent.length,
      uploadedBy: user.id || user._id,
    });

    return mediaFile;
  }

  async getFiles(filters: any = {}): Promise<any[]> {
    return this.repository.findAll(filters);
  }

  async renameFile(id: string, newName: string, user: any): Promise<any> {
    const mediaFile = await this.repository.findById(id);
    if (!mediaFile) throw new Error('File not found');

    // RBAC: check owner or admin
    if (user.role !== 'admin' && mediaFile.uploadedBy.toString() !== (user.id || user._id).toString()) {
      throw new Error('Forbidden: You can only rename your own files');
    }

    return this.repository.update(id, { originalName: newName });
  }

  async deleteFile(id: string, user: any): Promise<void> {
    const mediaFile = await this.repository.findById(id);
    if (!mediaFile) throw new Error('File not found');

    const userId = (user.id || user._id || '').toString();
    const ownerId = mediaFile.uploadedBy.toString();

    // RBAC: check owner or admin
    if (user.role !== 'admin' && ownerId !== userId) {
      throw new Error('Forbidden: You can only delete your own files');
    }

    const filePath = path.join(this.mediaRoot, mediaFile.savedName);
    await unlink(filePath);
    await this.repository.delete(id);
  }
}
