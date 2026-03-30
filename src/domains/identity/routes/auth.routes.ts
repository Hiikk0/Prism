import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';

// JSON Schmea for validation
const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 6 }
    }
  }
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' }
    }
  }
};

export default async function authRoutes(fastify: FastifyInstance, options: { jwtSecret: string }) {
  const authController = new AuthController(new AuthService(new UserRepository(), options.jwtSecret));

  fastify.post('/register', { schema: registerSchema }, authController.register.bind(authController));
  fastify.post('/login', { schema: loginSchema }, authController.login.bind(authController));
}
