import { FileService } from '@/domains/filesystem/services/file.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import { ScannerService } from '@/domains/filesystem/services/scanner.service';
import * as fs from 'fs/promises';
import path from 'path';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('@/domains/filesystem/services/scanner.service');
jest.mock('fs/promises');

describe('FileService', () => {
  let fileService: FileService;
  let mockRepo: jest.Mocked<MediaFileRepository>;
  let mockSettingsRepo: jest.Mocked<any>;
  let mockScanner: jest.Mocked<ScannerService>;
  const MEDIA_ROOT = 'C:/media';

  beforeEach(() => {
    mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
    mockSettingsRepo = {
      getSettings: jest.fn().mockResolvedValue({ mediaRootDirectory: MEDIA_ROOT })
    } as any;
    mockScanner = new ScannerService(null as any, null as any, '', null as any, '') as jest.Mocked<ScannerService>;
    fileService = new FileService(mockRepo, mockSettingsRepo, mockScanner, MEDIA_ROOT);
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
      mockRepo.findById.mockResolvedValue({ isFolder: true, path: '../media-hacks' } as any);

      await expect(
        fileService.uploadFile({
          filename: '../../../media-hacks/test.mp4',
          mimetype: 'video/mp4',
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-data')),
        } as any, mockUser as any, 'hacker-folder')
      ).rejects.toThrow('Security: Invalid file path');
    });
  });

  describe('deleteFile', () => {
    const mockFile = { 
      _id: 'file1', 
      savedName: '123-test.mp4', 
      path: '123-test.mp4',
      uploadedBy: 'user123',
      isFolder: false
    };

    it('should allow owner to delete file', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await fileService.deleteFiles(['file1'], { _id: 'user123', role: 'user' } as any);

      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('123-test.mp4'), expect.any(Object));
      expect(mockRepo.delete).toHaveBeenCalledWith('file1');
    });

    it('should allow admin to delete any file', async () => {
      mockRepo.findById.mockResolvedValue(mockFile as any);
      
      await fileService.deleteFiles(['file1'], { _id: 'admin456', role: 'admin' } as any);

      expect(mockRepo.delete).toHaveBeenCalledWith('file1');
    });
  });

  describe('renameFile (Deep Move)', () => {
    const mockUser = { _id: 'user123', role: 'user' };
    const mockFolder = { 
      _id: 'folder1', 
      originalName: 'OldFolder', 
      path: 'OldFolder',
      isFolder: true,
      uploadedBy: 'user123' 
    };

    it('should suspend watcher, perform deep move, and update DB recursively', async () => {
      mockRepo.findById.mockResolvedValue(mockFolder as any);
      mockRepo.findByPath.mockResolvedValue(null); // Target doesn't exist in DB
      mockRepo.findByPathPrefix.mockResolvedValue([
        { _id: 'file1', path: 'OldFolder/movie.mp4' }
      ] as any);
      (fs.access as jest.Mock).mockRejectedValue({ code: 'ENOENT' }); // Target doesn't exist on disk
      (fs.readdir as jest.Mock).mockResolvedValue([
        { name: 'movie.mp4', isDirectory: () => false }
      ]);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.rename as jest.Mock).mockResolvedValue(undefined);
      (fs.rm as jest.Mock).mockResolvedValue(undefined);
      mockRepo.update.mockResolvedValue({ ...mockFolder, originalName: 'NewFolder', path: 'NewFolder' } as any);

      await fileService.renameFile('folder1', 'NewFolder', mockUser as any);

      // Check watcher suspension
      expect(mockScanner.unwatch).toHaveBeenCalledWith('OldFolder');
      expect(mockScanner.unwatch).toHaveBeenCalledWith('NewFolder');
      
      // Check physical move
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('NewFolder'), { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith(
        expect.stringContaining('OldFolder' + path.sep + 'movie.mp4'),
        expect.stringContaining('NewFolder' + path.sep + 'movie.mp4')
      );
      
      // Check recursive DB update
      expect(mockRepo.update).toHaveBeenCalledWith('file1', { path: 'NewFolder/movie.mp4' });
      
      // Check watcher resumption
      expect(mockScanner.watch).toHaveBeenCalledWith('NewFolder');
    });

  });
});
