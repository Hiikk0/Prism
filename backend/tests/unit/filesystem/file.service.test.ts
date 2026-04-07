import { FileService } from '@/domains/filesystem/services/file.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import * as fs from 'fs/promises';
import path from 'path';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('fs/promises');

describe('FileService', () => {
  let fileService: FileService;
  let mockRepo: jest.Mocked<MediaFileRepository>;
  let mockSettingsRepo: jest.Mocked<any>;
  const MEDIA_ROOT = 'C:/media';

  beforeEach(() => {
    mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
    mockSettingsRepo = {
      getSettings: jest.fn().mockResolvedValue({ mediaRootDirectory: MEDIA_ROOT })
    } as any;
    fileService = new FileService(mockRepo, mockSettingsRepo, MEDIA_ROOT);
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
    it('should block path traversal bypass (media -> media-hacks)', async () => {
      // Simulate file payload that has a relative path resulting in 'C:/media-hacks/test.mp4'
      // Inside uploadFile, parentId check is performed. If relativePath escapes MEDIA_ROOT...
      // Unfortunately we can't easily inject parent path without mocking repository correctly,
      // but we can test the explicit path traversal logic by mocking `path.join` or simulating
      // a manipulated savedName. Since we patched `fileService`, let's just use it and assume
      // it handles Path Jail properly. 
      // A better way is to test the actual thrown error.
      const hackerFile = {
        filename: '../../../media-hacks/test.mp4',
        mimetype: 'video/mp4',
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-data')),
      };

      // Sanitize will actually clean this to '..test.mp4' or similar, so we need to test
      // a case where sanitize fails or we manipulate parent path.
      mockRepo.findById.mockResolvedValue({ isFolder: true, path: '../media-hacks' } as any);

      await expect(
        fileService.uploadFile(hackerFile as any, mockUser as any, 'hacker-folder')
      ).rejects.toThrow('Security: Invalid file path');
    });
  });

  describe('deleteFile', () => {
    const mockFile = { 
      _id: 'file1', 
      savedName: '123-test.mp4', 
      path: '123-test.mp4',
      uploadedBy: 'user123' 
    };

    it('should allow owner to delete file', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await fileService.deleteFiles(['file1'], { _id: 'user123', role: 'user' } as any);

      expect(fs.rm).toHaveBeenCalledWith(path.join(MEDIA_ROOT, '123-test.mp4'), { recursive: true, force: true });
      expect(mockRepo.delete).toHaveBeenCalledWith('file1');
    });

    it('should allow admin to delete any file', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      
      await fileService.deleteFiles(['file1'], { _id: 'admin456', role: 'admin' } as any);

      expect(mockRepo.delete).toHaveBeenCalledWith('file1');
    });

    it('should skip file if user is not owner or admin', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      mockRepo.delete.mockClear();

      await fileService.deleteFiles(['file1'], { _id: 'other789', role: 'user' } as any);

      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('renameFile', () => {
    const mockFile = { 
      _id: 'file1', 
      originalName: 'old.mp4', 
      path: 'old.mp4',
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
