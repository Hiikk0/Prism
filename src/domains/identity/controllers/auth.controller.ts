import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await this.authService.register(request.body);
      
      // Set JWT in HttpOnly Cookie
      reply.setCookie('token', result.token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400 // 1 day
      });

      return reply.status(201).send({ user: result.user });
    } catch (err: any) {
      if (err.message === 'Email already exists') {
        return reply.status(409).send({ error: err.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { email, password } = request.body as any;
      const result = await this.authService.login(email, password);
      
      // Set JWT in HttpOnly Cookie
      reply.setCookie('token', result.token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400 // 1 day
      });

      return reply.status(200).send({ user: result.user });
    } catch (err: any) {
      if (err.message === 'Invalid credentials') {
        return reply.status(401).send({ error: err.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
}
