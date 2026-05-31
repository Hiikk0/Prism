import { MediaProcessorService } from '@/domains/filesystem/services/media-processor.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import ffmpeg from 'fluent-ffmpeg';
import { loadEsm } from 'load-esm';

import { SettingsRepository } from '@/domains/identity/repositories/settings.repository';
import { GpuManagerService } from '@/domains/filesystem/services/gpu-manager.service';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('@/domains/identity/repositories/settings.repository');
jest.mock('@/domains/filesystem/services/gpu-manager.service');
jest.mock('fluent-ffmpeg');
jest.mock('load-esm');
jest.mock('sharp', () => {
    const mockSharpInstance = {
        resize: jest.fn().mockReturnThis(),
        webp: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockResolvedValue(undefined)
    };
    return jest.fn(() => mockSharpInstance);
});
jest.mock('fs/promises', () => ({
    writeFile: jest.fn().mockResolvedValue(undefined)
}));

function createMockFfmpeg() {
    const mockInstance: any = {
        eventListeners: {} as Record<string, Function>,
        input: jest.fn().mockImplementation(function(this: any) { return this; }),
        seekInput: jest.fn().mockImplementation(function(this: any) { return this; }),
        duration: jest.fn().mockImplementation(function(this: any) { return this; }),
        complexFilter: jest.fn().mockImplementation(function(this: any) { return this; }),
        outputOptions: jest.fn().mockImplementation(function(this: any) { return this; }),
        output: jest.fn().mockImplementation(function(this: any) { return this; }),
        noVideo: jest.fn().mockImplementation(function(this: any) { return this; }),
        audioChannels: jest.fn().mockImplementation(function(this: any) { return this; }),
        audioFrequency: jest.fn().mockImplementation(function(this: any) { return this; }),
        format: jest.fn().mockImplementation(function(this: any) { return this; }),
        run: jest.fn().mockImplementation(function(this: any) {
            const endCb = this.eventListeners['end'];
            if (endCb) setImmediate(() => endCb());
            return this;
        }),
        save: jest.fn().mockImplementation(function(this: any) {
            const endCb = this.eventListeners['end'];
            if (endCb) setImmediate(() => endCb());
            return this;
        }),
        screenshots: jest.fn().mockImplementation(function(this: any) {
            const endCb = this.eventListeners['end'];
            if (endCb) setImmediate(() => endCb());
            return this;
        }),
        pipe: jest.fn().mockImplementation(function(this: any) {
            const stream: any = {
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'data') {
                        setImmediate(() => {
                            cb(Buffer.from(new Array(1000).fill(10)));
                            if (stream.endCb) stream.endCb();
                        });
                    } else if (event === 'end') {
                        stream.endCb = cb;
                    }
                    return stream;
                })
            };
            return stream;
        }),
        on: jest.fn().mockImplementation(function(this: any, event, cb) {
            this.eventListeners[event] = cb;
            return this;
        })
    };
    return mockInstance;
}

describe('MediaProcessorService', () => {
    let mediaProcessorService: MediaProcessorService;
    let mockRepo: jest.Mocked<MediaFileRepository>;
    let mockSettingsRepo: jest.Mocked<SettingsRepository>;
    let mockMm: any;

    beforeEach(() => {
        mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
        mockSettingsRepo = new SettingsRepository() as jest.Mocked<SettingsRepository>;
        mockSettingsRepo.getSettings.mockResolvedValue({ hardwareEncoder: 'cpu_h264' } as any);

        const mockGpuManager = new GpuManagerService() as jest.Mocked<GpuManagerService>;
        mockGpuManager.allocate = jest.fn().mockReturnValue({ encoderName: 'libx264', hwaccelArgs: [] });

        mediaProcessorService = new MediaProcessorService(
          mockRepo, 
          mockSettingsRepo,
          'C:/media', 
          'C:/media/.cache/thumbnails', 
          'C:/media/.cache/preview', 
          'C:/media/.cache/subtitles',
          'C:/media/.cache/waveforms',
          mockGpuManager
        );
        
        mockMm = {
            parseFile: jest.fn()
        };
        (loadEsm as jest.Mock).mockResolvedValue(mockMm);
        
        const mockFfmpegInstance = createMockFfmpeg();
        (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpegInstance);

        jest.clearAllMocks();
    });

    it('should process audio metadata using music-metadata loaded via loadEsm', async () => {
        const mockMetadata = {
            format: { duration: 180 },
            common: { artist: 'Artist', title: 'Song', album: 'Album' }
        };
        mockMm.parseFile.mockResolvedValue(mockMetadata);
        mockRepo.findById.mockResolvedValue({ 
            _id: 'file1', 
            mimeType: 'audio/mpeg', 
            path: 'song.mp3', 
            savedName: 'song.mp3' 
        } as any);

        await mediaProcessorService.processFile('file1');

        expect(loadEsm).toHaveBeenCalledWith('music-metadata');
        expect(mockMm.parseFile).toHaveBeenCalled();
        expect(mockRepo.update).toHaveBeenCalledWith('file1', expect.objectContaining({
            metadata: expect.objectContaining({
                duration: 180,
                artist: 'Artist',
                title: 'Song'
            })
        }));
    });

    it('should extract cover from audio metadata if picture exists', async () => {
        const mockMetadata = {
            format: { duration: 180 },
            common: { 
                artist: 'Artist', 
                title: 'Song', 
                album: 'Album',
                picture: [{ data: Buffer.from('mock-image-data'), format: 'image/jpeg' }]
            }
        };
        mockMm.parseFile.mockResolvedValue(mockMetadata);
        mockRepo.findById.mockResolvedValue({ 
            _id: 'file_audio_cover', 
            mimeType: 'audio/mpeg', 
            path: 'song.mp3', 
            savedName: 'song.mp3' 
        } as any);

        await mediaProcessorService.processFile('file_audio_cover');

        expect(mockRepo.update).toHaveBeenCalledWith('file_audio_cover', expect.objectContaining({
            metadata: expect.objectContaining({
                thumbnailPath: expect.stringMatching(/file_audio_cover_thumb\.webp/)
            })
        }));
    });

    it('should process video metadata using ffmpeg', async () => {
        const mockFfprobeData = {
            format: { duration: 3600 },
            streams: [{ codec_type: 'video', width: 1920, height: 1080 }]
        };
        
        (ffmpeg.ffprobe as unknown as jest.Mock).mockImplementation((path, cb) => {
            cb(null, mockFfprobeData);
        });

        mockRepo.findById.mockResolvedValue({ 
            _id: 'file2', 
            mimeType: 'video/mp4', 
            path: 'movie.mp4', 
            savedName: 'movie.mp4' 
        } as any);

        await mediaProcessorService.processFile('file2');

        expect(ffmpeg.ffprobe).toHaveBeenCalled();
        expect(mockRepo.update).toHaveBeenCalledWith('file2', expect.objectContaining({
            metadata: expect.objectContaining({
                duration: 3600,
                resolution: '1920x1080'
            })
        }));
    });

    it('should extract subtitles from video if subtitle stream exists', async () => {
        const mockFfprobeData = {
            format: { duration: 3600 },
            streams: [
                { index: 0, codec_type: 'video', width: 1920, height: 1080 },
                { index: 1, codec_type: 'subtitle', tags: { language: 'eng', title: 'English' } },
                { index: 2, codec_type: 'subtitle', tags: { language: 'ukr', title: 'Ukrainian' } }
            ]
        };
        
        (ffmpeg.ffprobe as unknown as jest.Mock).mockImplementation((path, cb) => {
            cb(null, mockFfprobeData);
        });

        mockRepo.findById.mockResolvedValue({ 
            _id: 'file3', 
            mimeType: 'video/mkv', 
            path: 'movie.mkv', 
            savedName: 'movie.mkv' 
        } as any);

        await mediaProcessorService.processFile('file3');

        expect(mockRepo.update).toHaveBeenCalledWith('file3', expect.objectContaining({
            metadata: expect.objectContaining({
                subtitles: [
                    { language: 'eng', label: 'English', path: expect.stringContaining('.vtt') },
                    { language: 'ukr', label: 'Ukrainian', path: expect.stringContaining('.vtt') }
                ]
            })
        }));
    });
});
