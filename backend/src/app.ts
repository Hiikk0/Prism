import fastify, { FastifyError } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import authRoutes from './domains/identity/routes/auth.routes';
import fileRoutes from './domains/filesystem/routes/file.routes';
import { authMiddleware } from './shared/middleware/auth.middleware';
import { rbacMiddleware } from './shared/middleware/rbac.middleware';
import fastifyJwt from '@fastify/jwt';
import path from 'path';

export function buildApp(opts = {}) {
  const app = fastify(opts);
  
  const jwtSecret = process.env.JWT_SECRET || 'test_secret';
  const mediaRoot = process.env.MEDIA_ROOT_DIRECTORY || path.join(__dirname, '../media');

  // Register Plugins
  app.register(fastifyCookie, {
    secret: jwtSecret,
    parseOptions: {}
  });

  app.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: 'token',
      signed: false
    }
  });

  app.register(fastifyMultipart, {
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB default
    }
  });

  // Register Domains
  app.register(authRoutes, { prefix: '/api/auth', jwtSecret });
  app.register(fileRoutes, { prefix: '/api/files', jwtSecret, mediaRoot });

  // Add Health Check for Playwright/Uptime
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Custom Error Handler for Validation
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        error: `Validation failed: ${error.message}`,
        details: error.validation
      });
    }
    reply.send(error);
  });

  // Example Protected Route for generic testing if needed
  app.get('/protected', { preHandler: [authMiddleware(jwtSecret), rbacMiddleware(['admin'])] }, async (request, reply) => {
    return { ok: true };
  });

  return app;
}
