import { PlaylistModel, IPlaylist } from '../models/playlist.model';
import { PlaybackProgressModel, IPlaybackProgress } from '../models/playback-progress.model';
import { MediaFileModel } from '../../filesystem/models/mediafile.model';

export class PlayerService {
  async ensureSystemPlaylists(systemUserId: string): Promise<void> {
    const systemPlaylists = [
      { name: 'All Videos', mimePrefix: 'video/' },
      { name: 'All Music', mimePrefix: 'audio/' },
      { name: 'All Photos', mimePrefix: 'image/' }
    ];

    for (const p of systemPlaylists) {
      const exists = await PlaylistModel.findOne({ name: p.name, isSystem: true });
      if (!exists) {
        await PlaylistModel.create({
          name: p.name,
          userId: systemUserId,
          isSystem: true,
          isSmartPlaylist: true,
          smartFilter: { mimePrefix: p.mimePrefix },
          mediaItems: []
        });
      }
    }
  }

  async createPlaylist(userId: string, name: string): Promise<IPlaylist> {
    return PlaylistModel.create({
      name,
      userId,
      mediaItems: []
    });
  }

  async getUserPlaylists(userId: string): Promise<IPlaylist[]> {
    return PlaylistModel.find({ 
      $or: [{ userId }, { isSystem: true }] 
    }).sort({ isSystem: -1, createdAt: -1 });
  }

  async getPlaylistById(playlistId: string): Promise<IPlaylist | null> {
    return PlaylistModel.findById(playlistId);
  }

  async getPlaylistItems(playlistId: string, userId: string): Promise<any[]> {
    const playlist = await PlaylistModel.findById(playlistId);
    if (!playlist) throw new Error('Playlist not found');

    if (!playlist.isSystem && playlist.userId.toString() !== userId) {
      throw new Error('Forbidden: You do not have access to this playlist');
    }

    if (playlist.isSmartPlaylist && playlist.smartFilter) {
      return MediaFileModel.find({
        mimeType: { $regex: new RegExp(`^${playlist.smartFilter.mimePrefix}`, 'i') }
      }).sort({ createdAt: -1 });
    }

    const populated = await PlaylistModel.findById(playlistId).populate('mediaItems');
    return (populated as any)?.mediaItems || [];
  }

  async addMediaToPlaylist(playlistId: string, mediaId: string, userId: string): Promise<IPlaylist | null> {
    const playlist = await PlaylistModel.findOne({ _id: playlistId, userId });
    if (!playlist) throw new Error('Playlist not found');
    if (playlist.isSmartPlaylist) throw new Error('Cannot manually add items to a smart playlist');

    if (!playlist.mediaItems.includes(mediaId as any)) {
      playlist.mediaItems.push(mediaId as any);
      await playlist.save();
    }
    return playlist;
  }

  async removeMediaFromPlaylist(playlistId: string, mediaId: string, userId: string): Promise<IPlaylist | null> {
    const playlist = await PlaylistModel.findOne({ _id: playlistId, userId });
    if (!playlist) throw new Error('Playlist not found');

    playlist.mediaItems = playlist.mediaItems.filter(id => id.toString() !== mediaId);
    await playlist.save();
    return playlist;
  }

  async deletePlaylist(playlistId: string, userId: string): Promise<void> {
    const playlist = await PlaylistModel.findById(playlistId);
    if (!playlist) throw new Error('Playlist not found');
    if (playlist.isSystem) throw new Error('Cannot delete system playlist');

    const result = await PlaylistModel.deleteOne({ _id: playlistId, userId });
    if (result.deletedCount === 0) {
      throw new Error('Playlist not found');
    }
  }

  async saveProgress(userId: string, mediaId: string, currentTime: number): Promise<IPlaybackProgress> {
    return PlaybackProgressModel.findOneAndUpdate(
      { userId, mediaId },
      { currentTime },
      { upsert: true, new: true }
    );
  }

  async getRecentProgress(userId: string): Promise<IPlaybackProgress[]> {
    return PlaybackProgressModel.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .populate('mediaId');
  }

  async deleteProgress(userId: string, mediaId: string): Promise<void> {
    await PlaybackProgressModel.deleteOne({ userId, mediaId });
  }
}
