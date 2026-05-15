import mongoose from 'mongoose';
import { PlaylistModel } from '@/domains/player/models/playlist.model';
import { PlaybackProgressModel } from '@/domains/player/models/playback-progress.model';

describe('Player Models', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://localhost:27017/media-server-unit-test');
    }
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await PlaylistModel.deleteMany({});
    await PlaybackProgressModel.deleteMany({});
  });

  describe('PlaylistModel', () => {
    it('should create a playlist', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mediaId1 = new mongoose.Types.ObjectId();
      const mediaId2 = new mongoose.Types.ObjectId();

      const playlist = await PlaylistModel.create({
        name: 'My Favorites',
        userId,
        mediaItems: [mediaId1, mediaId2]
      });

      expect(playlist.name).toBe('My Favorites');
      expect(playlist.userId).toEqual(userId);
      expect(playlist.mediaItems).toHaveLength(2);
    });
  });

  describe('PlaybackProgressModel', () => {
    it('should create and update playback progress', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mediaId = new mongoose.Types.ObjectId();

      const progress = await PlaybackProgressModel.create({
        userId,
        mediaId,
        currentTime: 120.5
      });

      expect(progress.currentTime).toBe(120.5);

      progress.currentTime = 300.0;
      await progress.save();

      const updated = await PlaybackProgressModel.findById(progress._id);
      expect(updated?.currentTime).toBe(300.0);
    });
  });
});
