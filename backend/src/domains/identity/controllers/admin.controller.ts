import { FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import path from 'path';
import { access, mkdir } from 'fs/promises';

export class AdminController {
  constructor(private userService: UserService) {}

  async getSettings(request: FastifyRequest, reply: FastifyReply) {
    const settings = await this.userService.getSettings();
    return reply.send(settings);
  }

  async updateSettings(request: FastifyRequest, reply: FastifyReply) {
    const data = request.body as any;
    
    // Media path validation if changed
    if (data.mediaRootDirectory) {
      try {
        await access(data.mediaRootDirectory);
      } catch (err) {
        if (data.createIfMissing) {
          await mkdir(data.mediaRootDirectory, { recursive: true });
        } else {
          return reply.status(400).send({ 
            error: 'Path does not exist', 
            code: 'PATH_NOT_FOUND',
            suggestCreate: true 
          });
        }
      }
    }

    const settings = await this.userService.updateSettings(data);

    // Trigger scanner restart if relevant settings changed
    const scanner = (request.server as any).scanner;
    if (scanner && (data.mediaRootDirectory || data.usePolling !== undefined || data.pollingInterval !== undefined)) {
      await scanner.restartWatcher(data.mediaRootDirectory);
    }

    return reply.send(settings);
  }

  async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const users = await this.userService.listUsers();
    return reply.send(users);
  }

  async updateUserRole(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as any;
    const { role } = request.body as any;
    const user = await this.userService.updateUserRole(id, role);
    return reply.send(user);
  }
}
