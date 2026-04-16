import { JwtUser } from '../domains/filesystem/types';
import { ScannerService } from '../domains/filesystem/services/scanner.service';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtUser;
  }
  interface FastifyInstance {
    scanner?: ScannerService;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}
