import { MediaProcessorService } from '@/domains/filesystem/services/media-processor.service';
import { MediaFileRepository } from '@/domains/filesystem/repositories/mediafile.repository';
import ffmpeg from 'fluent-ffmpeg';
import { loadEsm } from 'load-esm';

jest.mock('@/domains/filesystem/repositories/mediafile.repository');
jest.mock('fluent-ffmpeg');
jest.mock('load-esm');

describe('MediaProcessorService', () => {
    let mediaProcessorService: MediaProcessorService;
    let mockRepo: jest.Mocked<MediaFileRepository>;
    let mockMm: any;

    beforeEach(() => {
        mockRepo = new MediaFileRepository() as jest.Mocked<MediaFileRepository>;
        mediaProcessorService = new MediaProcessorService(
          mockRepo, 
          'C:/media', 
          'C:/media/.cache/thumbnails', 
          'C:/media/.cache/preview', 
          'C:/media/.cache/subtitles'
        );
        
        mockMm = {
            parseFile: jest.fn()
        };
        (loadEsm as jest.Mock).mockResolvedValue(mockMm);
        
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

        // wait for queue to process (mocked queue is async)
        // For fastq.promise, we might need to wait for the promise from push if we want to ensure it's done
        // However, in our service, push is awaited.

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

    it('should process video metadata using ffmpeg', async () => {
        const mockFfprobeData = {
            format: { duration: 3600 },
            streams: [{ width: 1920, height: 1080 }]
        };
        
        (ffmpeg.ffprobe as unknown as jest.Mock).mockImplementation((path, cb) => {
            cb(null, mockFfprobeData);
        });

        const mockFfmpegInstance = {
            on: jest.fn().mockReturnThis(),
            screenshots: jest.fn().mockReturnThis()
        };
        (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpegInstance);
        mockFfmpegInstance.on.mockImplementation((event, cb) => {
            if (event === 'end') cb();
            return mockFfmpegInstance;
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

        const mockFfmpegInstance = {
            on: jest.fn().mockReturnThis(),
            screenshots: jest.fn().mockReturnThis(),
            output: jest.fn().mockReturnThis(),
            outputOptions: jest.fn().mockReturnThis(),
            run: jest.fn()
        };
        (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpegInstance);
        mockFfmpegInstance.on.mockImplementation((event, cb) => {
            if (event === 'end') cb();
            return mockFfmpegInstance;
        });

        mockRepo.findById.mockResolvedValue({ 
            _id: 'file3', 
            mimeType: 'video/mkv', 
            path: 'movie.mkv', 
            savedName: 'movie.mkv' 
        } as any);

        await mediaProcessorService.processFile('file3');

        // It should call ffmpeg for subtitles extraction
        // In our implementation, we'll expect ffmpeg to be called twice (once for screenshots, once for subtitles, or combined)
        // Let's assume we do it sequentially or use one command. It's easier sequentially for the test.
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
