import { FastifyRequest, FastifyReply } from 'fastify';
import { FileService } from '../services/file.service';
import { MediaFileRepository } from '../repositories/mediafile.repository';

export class FileController {
  constructor(private fileService: FileService) {}

  async getFiles(request: FastifyRequest, reply: FastifyReply) {
    const { type, parentId, isFolder, search } = request.query as any;
    const files = await this.fileService.getFiles({ type, parentId, isFolder, search });
    return reply.send(files);
  }

  async uploadFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { parentId } = request.query as any;
      const data = await (request as any).file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const user = (request as any).user;
      const result = await this.fileService.uploadFile(data, user, parentId);
      return reply.status(201).send(result);
    } catch (err: any) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async createFolder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, parentId } = request.body as any;
      const user = (request as any).user;
      const result = await this.fileService.createFolder(name, parentId, user);
      return reply.status(201).send(result);
    } catch (err: any) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async renameFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as any;
      const { originalName } = request.body as any;
      const user = (request as any).user;
      
      const result = await this.fileService.renameFile(id, originalName, user);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'File not found') return reply.status(404).send({ error: err.message });
      if (err.message.includes('Forbidden')) return reply.status(403).send({ error: err.message });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async moveFiles(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { ids, targetParentId } = request.body as any;
      const user = (request as any).user;
      await this.fileService.moveFiles(ids, targetParentId, user);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal Server Error' });
    }
  }

  async updateTags(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { ids, tags } = request.body as any;
      const user = (request as any).user;
      await this.fileService.updateTags(ids, tags, user);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Internal Server Error' });
    }
  }

  async deleteFiles(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { ids } = request.body as any;
      const user = (request as any).user;
      await this.fileService.deleteFiles(ids, user);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }

  async scanDirectory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const scanner = (request.server as any).scanner;
      if (!scanner) {
        return reply.status(500).send({ error: 'Scanner service not initialized' });
      }
      await scanner.fullScan();
      return reply.send({ message: 'Scan started' });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to trigger scan' });
    }
  }
}
