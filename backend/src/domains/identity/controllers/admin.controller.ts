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
      // Re-initialize the scanner with the potentially new media root
      // In a real application, we might need a more granular way to update the root
      await scanner.initialize();
    }

    return reply.send(settings);
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
