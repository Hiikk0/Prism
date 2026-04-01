import { FileService } from '@/domains/filesystem/services/file.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import * as fs from 'fs/promises';
import path from 'path';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('fs/promises');

describe('FileService', () => {
  let fileService: FileService;
  let mockRepo: jest.Mocked<MediaFileRepository>;
  const MEDIA_ROOT = 'C:/media_test';

  beforeEach(() => {
    mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
    fileService = new FileService(mockRepo, MEDIA_ROOT);
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    const mockUser = { _id: 'user123', role: 'user' };
    const mockFilePayload = {
      filename: 'test movie.mp4',
      mimetype: 'video/mp4',
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-data')),
    };

    it('should sanitize filename and save file', async () => {
      mockRepo.create.mockResolvedValue({ _id: 'file1', originalName: 'test movie.mp4' } as any);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await fileService.uploadFile(mockFilePayload as any, mockUser as any);

      expect(result.originalName).toBe('test movie.mp4');
      expect(fs.writeFile).toHaveBeenCalled();
      // Verify path traversal prevention (should be inside MEDIA_ROOT)
      const callPath = path.resolve((fs.writeFile as jest.Mock).mock.calls[0][0]);
      const expectedRoot = path.resolve(MEDIA_ROOT);
      expect(callPath.startsWith(expectedRoot)).toBe(true);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        originalName: 'test movie.mp4',
        mimeType: 'video/mp4',
        uploadedBy: 'user123'
      }));
    });
  });

  describe('deleteFile', () => {
    const mockFile = { 
      _id: 'file1', 
      savedName: '123-test.mp4', 
      uploadedBy: 'user123' 
    };

    it('should allow owner to delete file', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await fileService.deleteFile('file1', { _id: 'user123', role: 'user' } as any);

      expect(fs.unlink).toHaveBeenCalledWith(path.join(MEDIA_ROOT, '123-test.mp4'));
      expect(mockRepo.delete).toHaveBeenCalledWith('file1');
    });

    it('should allow admin to delete any file', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      
      await fileService.deleteFile('file1', { _id: 'admin456', role: 'admin' } as any);

      expect(mockRepo.delete).toHaveBeenCalledWith('file1');
    });

    it('should throw error if user is not owner or admin', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);

      await expect(
        fileService.deleteFile('file1', { _id: 'other789', role: 'user' } as any)
      ).rejects.toThrow('Forbidden: You can only delete your own files');
    });
  });

  describe('renameFile', () => {
    const mockFile = { 
      _id: 'file1', 
      originalName: 'old.mp4', 
      uploadedBy: 'user123' 
    };

    it('should allow owner to rename file', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      mockRepo.update.mockResolvedValue({ ...mockFile, originalName: 'new.mp4' } as any);

      const result = await fileService.renameFile('file1', 'new.mp4', { _id: 'user123', role: 'user' } as any);

      expect(result.originalName).toBe('new.mp4');
      expect(mockRepo.update).toHaveBeenCalledWith('file1', { originalName: 'new.mp4' });
    });

    it('should throw error if user is not owner or admin', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);

      await expect(
        fileService.renameFile('file1', 'new.mp4', { _id: 'other789', role: 'user' } as any)
      ).rejects.toThrow('Forbidden: You can only rename your own files');
    });
  });
});
