import mongoose from 'mongoose';
import { MediaFileModel } from '@/domains/filesystem/models/mediafile.model';
import { UserModel } from '@/domains/identity/models/user.model';

describe('MediaFile Model (Unit)', () => {
  beforeAll(async () => {
    // Only memory or unit-level test DB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://localhost:27017/media-server-unit-test');
    }
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await MediaFileModel.deleteMany({});
  });

  it('should create a media file with phase 3 fields (tags, metadata, parentId, hash)', async () => {
    const parentFolder = await MediaFileModel.create({
      originalName: 'Movies',
      savedName: 'Movies',
      path: 'Movies',
      mimeType: 'inode/directory',
      size: 0,
      uploadedBy: new mongoose.Types.ObjectId()
    });

    const fileData = {
      originalName: 'avatar.mp4',
      savedName: '123-avatar.mp4',
      path: '123-avatar.mp4',
      mimeType: 'video/mp4',
      size: 1048576,
      uploadedBy: new mongoose.Types.ObjectId(),
      parentId: parentFolder._id,
      tags: ['Sci-Fi', 'Action'],
      hash: 'abc123fastchunkhash',
      metadata: {
        duration: 9720,
        resolution: '1920x1080',
        thumbnailPath: '.cache/thumbnails/123-avatar.jpg',
        subtitles: [
          { language: 'en', path: '.cache/subtitles/123-avatar-en.vtt', label: 'English' }
        ]
      }
    };

    const mediaFile = await MediaFileModel.create(fileData);

    expect(mediaFile.originalName).toBe('avatar.mp4');
    expect(mediaFile.tags).toContain('Sci-Fi');
    expect(mediaFile.tags).toHaveLength(2);
    expect(mediaFile.parentId).toEqual(parentFolder._id);
    expect(mediaFile.hash).toBe('abc123fastchunkhash');
    expect(mediaFile.metadata?.duration).toBe(9720);
    expect(mediaFile.metadata?.thumbnailPath).toBe('.cache/thumbnails/123-avatar.jpg');
    expect(mediaFile.metadata?.resolution).toBe('1920x1080');
    expect(mediaFile.metadata?.subtitles).toHaveLength(1);
    expect(mediaFile.metadata?.subtitles?.[0].language).toBe('en');
  });

  it('should successfully save a file without optional phase 3 fields', async () => {
    // Ensuring backward compatibility
    const oldFileData = {
      originalName: 'simple.txt',
      savedName: 'simple.txt',
      path: 'simple.txt',
      mimeType: 'text/plain',
      size: 1024,
      uploadedBy: new mongoose.Types.ObjectId()
    };

    const mediaFile = await MediaFileModel.create(oldFileData);
    expect(mediaFile.originalName).toBe('simple.txt');
    expect(mediaFile.tags).toEqual([]);

    expect(mediaFile.metadata).toBeUndefined();
    expect(mediaFile.parentId).toBeUndefined();
  });
});
