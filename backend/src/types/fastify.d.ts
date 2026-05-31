import { JwtUser } from '../domains/filesystem/types';
import { ScannerService } from '../domains/filesystem/services/scanner.service';
import { MediaProcessorService } from '../domains/filesystem/services/media-processor.service';
import { TranscodingService } from '../domains/filesystem/services/transcoding.service';
import { GpuManagerService } from '../domains/filesystem/services/gpu-manager.service';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtUser;
  }
  interface FastifyInstance {
    scanner?: ScannerService;
    processor?: MediaProcessorService;
    transcoder?: TranscodingService;
    gpuManager?: GpuManagerService;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}
