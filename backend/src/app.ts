import fastify, { FastifyError } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import authRoutes from './domains/identity/routes/auth.routes';
import adminRoutes from './domains/identity/routes/admin.routes';
import userRoutes from './domains/identity/routes/user.routes';
import fileRoutes from './domains/filesystem/routes/file.routes';
import { authMiddleware } from './shared/middleware/auth.middleware';
import { rbacMiddleware } from './shared/middleware/rbac.middleware';
import fastifyJwt from '@fastify/jwt';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import path from 'path';

export function buildApp(opts = {}) {
  const app = fastify(opts);
  
  const jwtSecret = process.env.JWT_SECRET || 'test_secret';
  const defaultMediaRoot = process.env.MEDIA_ROOT_DIRECTORY || path.join(__dirname, '../media');

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
  
  // Security Hardening (Phase 2)
  app.register(fastifyHelmet, {
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
  });

  app.register(fastifyCors, {
    origin: true, // Allow all origins for dev/XMB consistency, but can be restricted later
    credentials: true,
  });

  app.register(fastifyRateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  // Register Domains
  app.register(authRoutes, { prefix: '/api/auth', jwtSecret });
  app.register(adminRoutes, { prefix: '/api/admin', jwtSecret });
  app.register(userRoutes, { prefix: '/api/users', jwtSecret });
  
  // File Routes now need to be handled carefully with dynamic media root
  app.register(fileRoutes, { prefix: '/api/files', jwtSecret, mediaRoot: defaultMediaRoot });

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

    // Phase 3: Error Sanitization for 401, 403, and 500 errors
    const statusCode = error.statusCode || 500;
    
    if (statusCode === 401) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }
    
    if (statusCode === 403) {
      return reply.status(403).send({ error: 'Forbidden', message: 'You do not have permission to access this resource' });
    }

    if (statusCode >= 500) {
      app.log.error(error); // Log the real error for devs
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    }

    reply.status(statusCode).send(error);
  });

  return app;
}
