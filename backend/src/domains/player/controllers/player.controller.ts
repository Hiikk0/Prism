import { FastifyRequest, FastifyReply } from 'fastify';
import { PlayerService } from '../services/player.service';
import { validate } from '../../../shared/utils/validate';
import { CreatePlaylistSchema, UpdatePlaylistMediaSchema, SaveProgressSchema } from '../schemas/player.schema';
import { getErrorMessage } from '../../../shared/utils/error.util';

export class PlayerController {
  constructor(private playerService: PlayerService) {}

  async createPlaylist(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name } = validate(CreatePlaylistSchema, request.body);
      const user = request.user;
      const playlist = await this.playerService.createPlaylist(user.id, name);
      return reply.status(201).send(playlist);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrorMessage(err) });
    }
  }

  async getPlaylist(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const user = request.user;
      const playlist = await this.playerService.getPlaylistById(id);
      if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });
      
      // Check permission
      if (!playlist.isSystem && playlist.userId.toString() !== user.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      return reply.send(playlist);
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async getPlaylists(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      const playlists = await this.playerService.getUserPlaylists(user.id);
      return reply.send(playlists);
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async getPlaylistItems(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const user = request.user;
      const items = await this.playerService.getPlaylistItems(id, user.id);
      return reply.send(items);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg === 'Playlist not found') return reply.status(404).send({ error: msg });
      if (msg.startsWith('Forbidden')) return reply.status(403).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  }

  async addMediaToPlaylist(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const { mediaId } = validate(UpdatePlaylistMediaSchema, request.body);
      const user = request.user;
      
      const playlist = await this.playerService.addMediaToPlaylist(id, mediaId, user.id);
      return reply.send(playlist);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg === 'Playlist not found') return reply.status(404).send({ error: msg });
      return reply.status(400).send({ error: msg });
    }
  }

  async removeMediaFromPlaylist(request: FastifyRequest<{ Params: { id: string, mediaId: string } }>, reply: FastifyReply) {
    try {
      const { id, mediaId } = request.params;
      const user = request.user;
      
      const playlist = await this.playerService.removeMediaFromPlaylist(id, mediaId, user.id);
      return reply.send(playlist);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg === 'Playlist not found') return reply.status(404).send({ error: msg });
      return reply.status(400).send({ error: msg });
    }
  }

  async deletePlaylist(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const user = request.user;
      
      await this.playerService.deletePlaylist(id, user.id);
      return reply.status(204).send();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg === 'Playlist not found') return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  }

  async saveProgress(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { mediaId, currentTime } = validate(SaveProgressSchema, request.body);
      const user = request.user;
      
      const progress = await this.playerService.saveProgress(user.id, mediaId, currentTime);
      return reply.status(200).send(progress);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrorMessage(err) });
    }
  }

  async getRecentProgress(request: FastifyRequest, reply: FastifyReply) {
    try {
      const user = request.user;
      const progress = await this.playerService.getRecentProgress(user.id);
      return reply.send(progress);
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async deleteProgress(request: FastifyRequest<{ Params: { mediaId: string } }>, reply: FastifyReply) {
    try {
      const { mediaId } = request.params;
      const user = request.user;
      await this.playerService.deleteProgress(user.id, mediaId);
      return reply.status(204).send();
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }
}
