import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service';
import { validate } from '../../../shared/utils/validate';
import { RegisterSchema, LoginSchema, ResetPasswordSchema } from '../schemas/auth.schema';
import { getErrorMessage } from '../../../shared/utils/error.util';

export class AuthController {
  constructor(private authService: AuthService) {}

  private setTokenCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    
    reply.setCookie('token', accessToken, {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 7200 // 2 hours
    });

    reply.setCookie('refreshToken', refreshToken, {
      path: '/api/auth/refresh',
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 604800 // 7 days
    });
  }

  async register(request: FastifyRequest, reply: FastifyReply) {
    try {
      const payload = validate(RegisterSchema, request.body);
      const result = await this.authService.register(payload);
      this.setTokenCookies(reply, result.accessToken, result.refreshToken);
      return reply.status(201).send({ 
        user: result.user, 
        recoveryKey: result.recoveryKey 
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message === 'Username already exists') {
        return reply.status(409).send({ error: message });
      }
      if (message === 'Registration is currently disabled') {
        return reply.status(403).send({ error: message });
      }
      return reply.status(500).send({ error: message || 'Internal Server Error' });
    }
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { username, password } = validate(LoginSchema, request.body);
      const result = await this.authService.login(username, password);
      this.setTokenCookies(reply, result.accessToken, result.refreshToken);
      return reply.status(200).send({ user: result.user });
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message === 'Invalid credentials') {
        return reply.status(401).send({ error: message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { username, recoveryKey, newPassword } = validate(ResetPasswordSchema, request.body);
      await this.authService.resetPassword(username, recoveryKey, newPassword);
      return reply.status(200).send({ message: 'Password reset successfully' });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrorMessage(err) });
    }
  }

  async guestLogin(request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await this.authService.guestLogin();
      this.setTokenCookies(reply, result.accessToken, result.refreshToken);
      return reply.status(200).send({ user: result.user });
    } catch (err: unknown) {
      return reply.status(403).send({ error: getErrorMessage(err) });
    }
  }

  async me(request: FastifyRequest, reply: FastifyReply) {
    try {
      const jwtUser = request.user;
      const user = await this.authService.findUserById(jwtUser.id);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      return reply.status(200).send({ user });
    } catch {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async getPublicSettings(request: FastifyRequest, reply: FastifyReply) {
    try {
      const settings = await this.authService.getPublicSettings();
      return reply.status(200).send(settings);
    } catch {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    try {
      reply.clearCookie('token', { path: '/' });
      reply.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      return reply.status(200).send({ message: 'Logged out successfully' });
    } catch {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
}
