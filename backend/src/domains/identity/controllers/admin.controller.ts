import { FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from '../services/user.service';
import { access, mkdir } from 'fs/promises';
import { validate } from '../../../shared/utils/validate';
import { getErrorMessage } from '../../../shared/utils/error.util';
import { UpdateSettingsSchema, UpdateUserRoleSchema } from '../schemas/admin.schema';

export class AdminController {
  constructor(private userService: UserService) {}

  async getSettings(request: FastifyRequest, reply: FastifyReply) {
    const settings = await this.userService.getSettings();
    return reply.send(settings);
  }

  async updateSettings(request: FastifyRequest, reply: FastifyReply) {
    const data = validate(UpdateSettingsSchema, request.body);
    
    // Media path validation if changed
    if (data.mediaRootDirectory) {
      try {
        await access(data.mediaRootDirectory);
      } catch (err: unknown) {
        if (data.createIfMissing) {
          await mkdir(data.mediaRootDirectory, { recursive: true });
        } else {
          return reply.status(400).send({ 
            error: `Path does not exist: ${getErrorMessage(err)}`, 
            code: 'PATH_NOT_FOUND',
            suggestCreate: true 
          });
        }
      }
    }

    const settings = await this.userService.updateSettings(data);

    // Trigger scanner restart if relevant settings changed
    const scanner = request.server.scanner;
    if (scanner && (data.mediaRootDirectory || data.usePolling !== undefined || data.pollingInterval !== undefined)) {
      await scanner.initialize();
    }

    // Trigger transcoder proactive start/stop if mode changed
    const transcoder = request.server.transcoder;
    if (transcoder) {
      if (data.gpuConfig) {
        await transcoder.stopAllProcesses();
        if (request.server.gpuManager) {
          request.server.gpuManager.applyConfig(data.gpuConfig);
        }
      }

      if (data.transcodeMode) {
        if (data.transcodeMode === 'DISK') {
          transcoder.startProactiveTranscoding().catch(() => {});
        } else if (data.transcodeMode === 'JIT') {
          // If switching to JIT, stop library-wide proactive work but keep interactive
          transcoder.stopBackgroundWork().catch(() => {});
        } else if (data.transcodeMode === 'OFF') {
          // If switching OFF, kill everything
          transcoder.stopAllProcesses().catch(() => {});
        }
      }
    }

    return reply.send(settings);
  }

  async getGpus(request: FastifyRequest, reply: FastifyReply) {
    const gpuManager = request.server.gpuManager;
    if (!gpuManager) {
      return reply.send([]);
    }
    return reply.send(gpuManager.getDevices());
  }

  async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const users = await this.userService.listUsers();
    return reply.send(users);
  }

  async updateUserRole(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { role } = validate(UpdateUserRoleSchema, request.body);
    const user = await this.userService.updateUserRole(id, role);
    return reply.send(user);
  }
}
