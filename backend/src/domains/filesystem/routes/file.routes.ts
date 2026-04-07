import { FastifyInstance } from 'fastify';
import { FileController } from '../controllers/file.controller';
import { FileService } from '../services/file.service';
import { MediaFileRepository } from '../repositories/mediafile.repository';
import { SettingsRepository } from '../../identity/repositories/settings.repository';
import { authMiddleware } from '@/shared/middleware/auth.middleware';
import { rbacMiddleware } from '@/shared/middleware/rbac.middleware';

export default async function fileRoutes(fastify: FastifyInstance, options: { jwtSecret: string, mediaRoot: string }) {
  const fileService = new FileService(
    new MediaFileRepository(), 
    new SettingsRepository(),
    options.mediaRoot
  );
  const fileController = new FileController(fileService);
  const auth = authMiddleware(options.jwtSecret);

  fastify.get('/', { preHandler: [auth] }, fileController.getFiles.bind(fileController));
  fastify.post('/', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.uploadFile.bind(fileController));
  fastify.post('/folders', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.createFolder.bind(fileController));
  fastify.put('/:id', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.renameFile.bind(fileController));
  fastify.patch('/move', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.moveFiles.bind(fileController));
  fastify.patch('/tags', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.updateTags.bind(fileController));
  fastify.delete('/', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.deleteFiles.bind(fileController));
  fastify.post('/scan', { preHandler: [auth, rbacMiddleware(['admin'])] }, fileController.scanDirectory.bind(fileController));
}
