import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { authMiddleware } from '@/shared/middleware/auth.middleware';
import { rbacMiddleware } from '@/shared/middleware/rbac.middleware';

export default async function adminRoutes(fastify: FastifyInstance, options: { jwtSecret: string }) {
  const adminController = new AdminController(
    new UserService(new UserRepository(), new SettingsRepository())
  );

  const preHandlers = [authMiddleware(options.jwtSecret), rbacMiddleware(['admin'])];

  fastify.get('/settings', { preHandler: preHandlers }, adminController.getSettings.bind(adminController));
  fastify.patch('/settings', { preHandler: preHandlers }, adminController.updateSettings.bind(adminController));
  
  fastify.get('/users', { preHandler: preHandlers }, adminController.listUsers.bind(adminController));
  fastify.patch('/users/:id/role', { preHandler: preHandlers }, adminController.updateUserRole.bind(adminController));
}
