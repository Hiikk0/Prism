import { FastifyInstance } from 'fastify';
import { FileController } from '../controllers/file.controller';
import { authMiddleware } from '@/shared/middleware/auth.middleware';
import { rbacMiddleware } from '@/shared/middleware/rbac.middleware';

export default async function fileRoutes(fastify: FastifyInstance, options: { jwtSecret: string, mediaRoot: string }) {
  const fileController = new FileController(options.mediaRoot);
  const auth = authMiddleware(options.jwtSecret);

  fastify.get('/', { preHandler: [auth] }, fileController.getFiles.bind(fileController));
  fastify.post('/', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.uploadFile.bind(fileController));
  fastify.put('/:id', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.renameFile.bind(fileController));
  fastify.delete('/:id', { preHandler: [auth, rbacMiddleware(['user', 'admin'])] }, fileController.deleteFile.bind(fileController));
}
