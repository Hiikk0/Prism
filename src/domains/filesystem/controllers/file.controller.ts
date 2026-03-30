import { FastifyRequest, FastifyReply } from 'fastify';
import { FileService } from '../services/file.service';
import { MediaFileRepository } from '../repositories/mediafile.repository';

export class FileController {
  private fileService: FileService;

  constructor(mediaRoot: string) {
    this.fileService = new FileService(new MediaFileRepository(), mediaRoot);
  }

  async getFiles(request: FastifyRequest, reply: FastifyReply) {
    const { type } = request.query as any;
    const files = await this.fileService.getFiles({ type });
    return reply.send(files);
  }

  async uploadFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = await (request as any).file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const user = (request as any).user;
      const result = await this.fileService.uploadFile(data, user);
      return reply.status(201).send(result);
    } catch (err: any) {
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

  async deleteFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as any;
      const user = (request as any).user;
      
      await this.fileService.deleteFile(id, user);
      return reply.status(204).send();
    } catch (err: any) {
      if (err.message === 'File not found') return reply.status(404).send({ error: err.message });
      if (err.message.includes('Forbidden')) return reply.status(403).send({ error: err.message });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
}
