import { FastifyInstance } from 'fastify';
import { PlayerController } from '../controllers/player.controller';
import { PlayerService } from '../services/player.service';
import { authMiddleware } from '@/shared/middleware/auth.middleware';

export default async function playerRoutes(fastify: FastifyInstance) {
  const playerService = new PlayerService();
  const playerController = new PlayerController(playerService);
  const auth = authMiddleware();

  // Playlists
  fastify.post('/playlists', { preHandler: [auth] }, playerController.createPlaylist.bind(playerController));
  fastify.get('/playlists', { preHandler: [auth] }, playerController.getPlaylists.bind(playerController));
  fastify.get<{ Params: { id: string } }>('/playlists/:id', { preHandler: [auth] }, playerController.getPlaylist.bind(playerController));
  fastify.get<{ Params: { id: string } }>('/playlists/:id/items', { preHandler: [auth] }, playerController.getPlaylistItems.bind(playerController));
  fastify.post<{ Params: { id: string } }>('/playlists/:id/media', { preHandler: [auth] }, playerController.addMediaToPlaylist.bind(playerController));
  fastify.delete<{ Params: { id: string, mediaId: string } }>('/playlists/:id/media/:mediaId', { preHandler: [auth] }, playerController.removeMediaFromPlaylist.bind(playerController));
  fastify.delete<{ Params: { id: string } }>('/playlists/:id', { preHandler: [auth] }, playerController.deletePlaylist.bind(playerController));

  // Progress
  fastify.post('/progress', { preHandler: [auth] }, playerController.saveProgress.bind(playerController));
  fastify.get('/progress', { preHandler: [auth] }, playerController.getRecentProgress.bind(playerController));
  fastify.delete<{ Params: { mediaId: string } }>('/progress/:mediaId', { preHandler: [auth] }, playerController.deleteProgress.bind(playerController));
}
