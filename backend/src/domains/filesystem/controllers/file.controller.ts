import { FastifyRequest, FastifyReply } from 'fastify';
import { FileService } from '../services/file.service';
import { validate } from '../../../shared/utils/validate';
import { 
  GetFilesQuerySchema, 
  CreateFolderSchema, 
  RenameFileSchema, 
  RenameFileParamsSchema,
  MoveFilesSchema,
  UpdateTagsSchema, 
  DeleteFilesSchema,
  UploadQuerySchema
} from '../schemas/file.schema';
import { getErrorMessage } from '../../../shared/utils/error.util';

export class FileController {
  constructor(private fileService: FileService) {}

  async getFiles(request: FastifyRequest, reply: FastifyReply) {
    const { type, parentId, isFolder, search, skip, limit } = validate(GetFilesQuerySchema, request.query);
    const files = await this.fileService.getFiles({ 
      type, 
      parentId, 
      isFolder: isFolder === 'true' ? true : (isFolder === 'false' ? false : undefined), 
      search,
      skip: skip !== undefined ? parseInt(skip) : undefined,
      limit: limit !== undefined ? parseInt(limit) : undefined
    });
    return reply.send(files);
  }

  async uploadFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { parentId } = validate(UploadQuerySchema, request.query);
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const user = request.user;
      const result = await this.fileService.uploadFile(data, user, parentId);
      return reply.status(201).send(result);
    } catch (err: unknown) {
      console.error(err);
      return reply.status(500).send({ error: `Internal Server Error: ${getErrorMessage(err)}` });
    }
  }

  async createFolder(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { name, parentId } = validate(CreateFolderSchema, request.body);
      const user = request.user;
      const result = await this.fileService.createFolder(name, parentId, user);
      return reply.status(201).send(result);
    } catch (err: unknown) {
      console.error(err);
      return reply.status(500).send({ error: `Internal Server Error: ${getErrorMessage(err)}` });
    }
  }

  async renameFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = validate(RenameFileParamsSchema, request.params);
      const { originalName } = validate(RenameFileSchema, request.body);
      const user = request.user;
      
      const result = await this.fileService.renameFile(id, originalName, user);
      return reply.send(result);
    } catch (err: unknown) {
      console.error('Rename error:', err);
      const message = getErrorMessage(err);
      if (message === 'File not found') return reply.status(404).send({ error: 'File not found' });
      if (message.includes('Forbidden')) return reply.status(403).send({ error: 'Forbidden' });
      return reply.status(500).send({ error: `Internal Server Error: ${message}` });
    }
  }

  async moveFiles(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { ids, targetParentId } = validate(MoveFilesSchema, request.body);
      const user = request.user;
      await this.fileService.moveFiles(ids, targetParentId, user);
      return reply.status(204).send();
    } catch (err: unknown) {
      console.error('Move error:', err);
      const message = getErrorMessage(err);
      if (message.includes('busy')) return reply.status(400).send({ error: 'File or folder is busy' });
      return reply.status(500).send({ error: `Internal Server Error: ${message}` });
    }
  }

  async updateTags(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { ids, tags } = validate(UpdateTagsSchema, request.body);
      const user = request.user;
      await this.fileService.updateTags(ids, tags, user);
      return reply.status(204).send();
    } catch (err: unknown) {
      console.error('Update tags error:', err);
      return reply.status(500).send({ error: `Internal Server Error: ${getErrorMessage(err)}` });
    }
  }

  async deleteFiles(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { ids } = validate(DeleteFilesSchema, request.body);
      const user = request.user;
      await this.fileService.deleteFiles(ids, user);
      return reply.status(204).send();
    } catch (err: unknown) {
      console.error('Delete files error:', err);
      return reply.status(500).send({ error: `Internal Server Error: ${getErrorMessage(err)}` });
    }
  }

  async scanDirectory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const scanner = request.server.scanner;
      if (!scanner) {
        return reply.status(500).send({ error: 'Scanner service not initialized' });
      }
      await scanner.initialScan();
      return reply.send({ message: 'Scan started' });
    } catch (err: unknown) {
      console.error('Scan error:', err);
      return reply.status(500).send({ error: `Failed to trigger scan: ${getErrorMessage(err)}` });
    }
  }
}
