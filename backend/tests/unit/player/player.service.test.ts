import { PlayerService } from '@/domains/player/services/player.service';
import { PlaylistModel } from '@/domains/player/models/playlist.model';
import { PlaybackProgressModel } from '@/domains/player/models/playback-progress.model';

jest.mock('@/domains/player/models/playlist.model');
jest.mock('@/domains/player/models/playback-progress.model');

describe('PlayerService', () => {
  let playerService: PlayerService;

  beforeEach(() => {
    playerService = new PlayerService();
    jest.clearAllMocks();
  });

  describe('Playlists', () => {
    it('should create a playlist', async () => {
      const mockPlaylist = { _id: 'p1', name: 'My List', userId: 'user1', mediaItems: [] };
      (PlaylistModel.create as jest.Mock).mockResolvedValue(mockPlaylist);

      const result = await playerService.createPlaylist('user1', 'My List');

      expect(PlaylistModel.create).toHaveBeenCalledWith({
        name: 'My List',
        userId: 'user1',
        mediaItems: []
      });
      expect(result).toEqual(mockPlaylist);
    });

    it('should get user playlists', async () => {
      const mockPlaylists = [{ _id: 'p1', name: 'My List' }];
      (PlaylistModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockPlaylists)
        })
      });

      const result = await playerService.getUserPlaylists('user1');

      expect(PlaylistModel.find).toHaveBeenCalledWith({ userId: 'user1' });
      expect(result).toEqual(mockPlaylists);
    });
  });

  describe('Playback Progress', () => {
    it('should save progress', async () => {
      (PlaybackProgressModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: 'pr1' });

      await playerService.saveProgress('user1', 'media1', 120.5);

      expect(PlaybackProgressModel.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user1', mediaId: 'media1' },
        { currentTime: 120.5 },
        { upsert: true, new: true }
      );
    });

    it('should get recent progress for user', async () => {
      const mockProgress = [{ mediaId: 'media1', currentTime: 120.5 }];
      (PlaybackProgressModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockProgress)
          })
        })
      });

      const result = await playerService.getRecentProgress('user1');

      expect(PlaybackProgressModel.find).toHaveBeenCalledWith({ userId: 'user1' });
      expect(result).toEqual(mockProgress);
    });
  });
});
