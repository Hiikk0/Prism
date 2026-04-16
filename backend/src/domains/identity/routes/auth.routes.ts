import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { authMiddleware } from '@/shared/middleware/auth.middleware';

// JSON Schema for validation
const registerSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 3 },
      password: { type: 'string', minLength: 6, maxLength: 128 }
    }
  }
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string' },
      password: { type: 'string', maxLength: 128 }
    }
  }
};

const resetPasswordSchema = {
  body: {
    type: 'object',
    required: ['username', 'recoveryKey', 'newPassword'],
    properties: {
      username: { type: 'string' },
      recoveryKey: { type: 'string' },
      newPassword: { type: 'string', minLength: 6, maxLength: 128 }
    }
  }
};

export default async function authRoutes(fastify: FastifyInstance, options: { jwtSecret: string }) {
  const authController = new AuthController(
    new AuthService(new UserRepository(), new SettingsRepository(), options.jwtSecret)
  );

  fastify.post('/register', { schema: registerSchema }, authController.register.bind(authController));
  fastify.post('/login', { schema: loginSchema }, authController.login.bind(authController));
  fastify.post('/reset-password', { schema: resetPasswordSchema }, authController.resetPassword.bind(authController));
  fastify.post('/guest-login', authController.guestLogin.bind(authController));
  fastify.get('/me', { preHandler: [authMiddleware()] }, authController.me.bind(authController));
  fastify.get('/settings', authController.getPublicSettings.bind(authController));
  fastify.post('/logout', authController.logout.bind(authController));
}
