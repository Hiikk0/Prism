import { FastifyInstance } from 'fastify';
import { FileController } from '../controllers/file.controller';
import { FileService } from '../services/file.service';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { SettingsRepository } from '../../identity/repositories/settings.repository';
import { authMiddleware } from '@/shared/middleware/auth.middleware';
import { rbacMiddleware } from '@/shared/middleware/rbac.middleware';
import { fileEvents } from '../../../shared/utils/event-bus';

export default async function fileRoutes(fastify: FastifyInstance, options: { jwtSecret: string, mediaRoot: string }) {
  const fileService = new FileService(
    new MediaFileRepository(), 
    new SettingsRepository(),
    fastify.scanner!,
    options.mediaRoot
  );
  const fileController = new FileController(fileService);
  const auth = authMiddleware();

  fastify.get('/', { preHandler: [auth] }, fileController.getFiles.bind(fileController));
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: [auth] }, fileController.getFile.bind(fileController));
  
  // SSE endpoint for filesystem events
  fastify.get('/events', { preHandler: [auth] }, (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true'
    });

    // Send initial handshake
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    let timeoutId: NodeJS.Timeout;

    // Send a keep-alive comment every 30 seconds to prevent proxy timeout
    const keepAlive = () => {
      reply.raw.write(': keep-alive\n\n');
      timeoutId = setTimeout(keepAlive, 30000);
    };
    keepAlive();

    const onChange = () => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'fs_change' })}\n\n`);
    };

    fileEvents.on('fs_change', onChange);

    req.raw.on('close', () => {
      clearTimeout(timeoutId);
      fileEvents.off('fs_change', onChange);
    });
  });

  fastify.post('/', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.uploadFile.bind(fileController));
  fastify.post('/folders', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.createFolder.bind(fileController));
  fastify.put('/:id', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.renameFile.bind(fileController));
  fastify.patch('/move', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.moveFiles.bind(fileController));
  fastify.patch('/tags', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.updateTags.bind(fileController));
  fastify.delete('/', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.deleteFiles.bind(fileController));
  fastify.post('/scan', { preHandler: [auth, rbacMiddleware(['admin'])] }, fileController.scanDirectory.bind(fileController));

  // Player & Streaming routes
  fastify.get<{ Params: { id: string } }>('/:id/stream', { preHandler: [auth] }, fileController.streamFile.bind(fileController));
  fastify.get<{ Params: { id: string } }>('/:id/thumbnail', { preHandler: [auth] }, fileController.getThumbnail.bind(fileController));
  fastify.get<{ Params: { id: string } }>('/:id/preview', { preHandler: [auth] }, fileController.getPreview.bind(fileController));
  fastify.get<{ Params: { id: string, index: string } }>('/:id/subtitles/:index', { preHandler: [auth] }, fileController.getSubtitle.bind(fileController));
}
