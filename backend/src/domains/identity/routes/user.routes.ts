import { FastifyInstance } from 'fastify';
import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { authMiddleware } from '@/shared/middleware/auth.middleware';

export default async function userRoutes(fastify: FastifyInstance) {
  const userController = new UserController(
    new UserService(new UserRepository(), new SettingsRepository())
  );

  fastify.patch('/profile', { preHandler: [authMiddleware()] }, userController.updateProfile.bind(userController));
}
