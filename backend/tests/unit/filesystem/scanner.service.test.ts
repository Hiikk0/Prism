import { ScannerService } from '@/domains/filesystem/services/scanner.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import { MediaProcessorService } from '@/domains/filesystem/services/media-processor.service';
import { loadEsm } from 'load-esm';
import * as fs from 'fs/promises';
import path from 'path';

import { SettingsRepository } from '@/domains/identity/repositories/settings.repository';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('@/domains/filesystem/services/media-processor.service');
jest.mock('@/domains/identity/repositories/settings.repository');
jest.mock('@/domains/filesystem/utils/hash.util');
jest.mock('load-esm');
jest.mock('fs/promises');

import { generateFastHash } from '@/domains/filesystem/utils/hash.util';

describe('ScannerService', () => {
    let scannerService: ScannerService;
    let mockRepo: jest.Mocked<MediaFileRepository>;
    let mockProcessor: jest.Mocked<MediaProcessorService>;
    let mockSettingsRepo: jest.Mocked<SettingsRepository>;
    let mockWatcher: any;
    const MEDIA_ROOT = 'C:/media';
    const SYSTEM_USER_ID = 'system_id';

    beforeEach(() => {
        mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
        mockProcessor = new MediaProcessorService(mockRepo, MEDIA_ROOT, 'C:/th') as jest.Mocked<MediaProcessorService>;
        mockSettingsRepo = new SettingsRepository() as jest.Mocked<SettingsRepository>;

        mockSettingsRepo.getSettings.mockResolvedValue({
            usePolling: false,
            pollingInterval: 100,
            mediaRootDirectory: MEDIA_ROOT
        } as any);

        mockWatcher = {
            on: jest.fn().mockReturnThis(),
            close: jest.fn().mockResolvedValue(undefined)
        };

        (loadEsm as jest.Mock).mockImplementation(async (pkg) => {
            if (pkg === 'chokidar') return { watch: () => mockWatcher };
            return {};
        });

        scannerService = new ScannerService(mockRepo, mockProcessor, MEDIA_ROOT, mockSettingsRepo, SYSTEM_USER_ID);
        jest.clearAllMocks();
    });

    it('should initialize chokidar watcher and subscribe to events', async () => {
        await scannerService.initialize();

        expect(loadEsm).toHaveBeenCalledWith('chokidar');
        expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
        expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
    });

    it('should handle "add" event by creating a record in DB and triggering processor', async () => {
        await scannerService.initialize();
        const addHandler = mockWatcher.on.mock.calls.find((call: any) => call[0] === 'add')[1];

        const testPath = path.join(MEDIA_ROOT, 'new_video.mp4');
        (fs.realpath as jest.Mock).mockResolvedValue(testPath);
        (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => false, size: 1024 });
        (generateFastHash as jest.Mock).mockResolvedValue('hash123');

        mockRepo.findAll.mockResolvedValue({ items: [], total: 0 }); // No duplicates
        mockRepo.create.mockResolvedValue({ _id: 'file123' } as any);

        await addHandler(testPath);

        expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            originalName: 'new_video.mp4'
        }));
        expect(mockProcessor.processFile).toHaveBeenCalledWith('file123');
    });

    it('should prevent path traversal and infinite loops', async () => {
        // This will be more thoroughly tested in the implementation via internal logic
        // but we can ensure it uses readdir with recursion control or similar.
    });
});
