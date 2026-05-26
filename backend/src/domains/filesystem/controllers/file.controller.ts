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
import fs from 'fs';
import { access } from 'fs/promises';
import path from 'path';

import { TranscodingService } from '../services/transcoding.service';

export class FileController {
  constructor(
    private fileService: FileService,
    private transcodingService: TranscodingService
  ) {}

  async getHlsManifest(request: FastifyRequest<{ Params: { id: string, quality: string } }>, reply: FastifyReply) {
    try {
      const { id, quality } = request.params;
      const manifestPath = await this.transcodingService.getHlsManifest(id, parseInt(quality));
      return reply.type('application/x-mpegurl').send(fs.createReadStream(manifestPath));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async getHlsSegment(req: FastifyRequest<{ Params: { id: string, quality: string, segment: string } }>, reply: FastifyReply) {
    const { id, quality, segment } = req.params;
    const segmentIndex = parseInt(segment.replace('seg_', '').replace('.ts', ''));

    try {
      await this.transcodingService.ensureSegment(id, parseInt(quality), segmentIndex);
      
      const mediaRoot = await this.fileService.getMediaRoot();
      const segmentPath = path.join(mediaRoot, '.cache/transcode', id, quality, segment);
      
      // On Windows, a file being written by FFmpeg might be locked.
      // We try to read it with a small retry logic.
      let data;
      let attempts = 0;
      while (attempts < 5) {
        try {
          data = await fs.promises.readFile(segmentPath);
          break;
        } catch (err) {
          attempts++;
          if (attempts === 5) throw err;
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      return reply.type('video/MP2T').send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async cleanupHls(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { id } = req.params;
    const userId = (req.user as any)?.id;
    try {
      await this.transcodingService.cleanupTranscode(id, undefined, userId);
      return reply.send({ success: true });
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  // POST version for navigator.sendBeacon (fires on tab close / hard refresh)
  async cleanupHlsBeacon(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { id } = req.params;
    const userId = (req.user as any)?.id;
    try {
      await this.transcodingService.cleanupTranscode(id, undefined, userId);
      return reply.status(204).send();
    } catch {
      // Silently ignore – beacon requests can't handle errors anyway
      return reply.status(204).send();
    }
  }

  async getAvailableQualities(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = req.params;
      const result = await this.transcodingService.getAvailableQualities(id);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async getFiles(request: FastifyRequest, reply: FastifyReply) {
    const { type, parentId, isFolder, search, skip, limit, sortBy } = validate(GetFilesQuerySchema, request.query);
    const files = await this.fileService.getFiles({ 
      type, 
      parentId, 
      isFolder: isFolder === 'true' ? true : (isFolder === 'false' ? false : undefined), 
      search,
      skip: skip !== undefined ? parseInt(skip) : undefined,
      limit: limit !== undefined ? parseInt(limit) : undefined,
      sortBy
    });
    return reply.send(files);
  }

  async getFile(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const file = await this.fileService.getFileById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      return reply.send(file);
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
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

  async streamFile(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const user = request.user;
      const { physicalPath, size, mimeType } = await this.fileService.getFileStreamData(id, user);

      const range = request.headers.range;
      if (!range) {
        // No range requested, send the whole file
        reply.header('Content-Length', size);
        reply.header('Content-Type', mimeType);
        return reply.send(fs.createReadStream(physicalPath));
      }

      // Parse Range
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

      if (start >= size || end >= size) {
        return reply.status(416).header('Content-Range', `bytes */${size}`).send();
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(physicalPath, { start, end });

      reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', chunksize);
      reply.header('Content-Type', mimeType);
      return reply.status(206).send(fileStream);

    } catch (err: unknown) {
      console.error('Stream error:', err);
      const message = getErrorMessage(err);
      if (message === 'File not found') return reply.status(404).send({ error: 'File not found' });
      return reply.status(500).send({ error: `Internal Server Error: ${message}` });
    }
  }

  async getThumbnail(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const mediaFile = await this.fileService.getFileById(id);
      if (!mediaFile) return reply.status(404).send({ error: 'File not found' });

      const thumbnailPath = mediaFile.metadata?.thumbnailPath;
      if (!thumbnailPath) {
        return reply.status(404).send({ error: 'Thumbnail not available' });
      }

      const mediaRoot = await this.fileService.getMediaRoot();
      const physicalPath = path.join(mediaRoot, thumbnailPath);
      
      const ext = path.extname(thumbnailPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const contentType = mimeMap[ext] || 'image/jpeg';

      return reply.type(contentType).send(fs.createReadStream(physicalPath));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async getPreview(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const mediaFile = await this.fileService.getFileById(id);
      if (!mediaFile) return reply.status(404).send({ error: 'File not found' });

      const previewPath = mediaFile.metadata?.previewPath;
      if (!previewPath) {
        return this.getThumbnail(request, reply);
      }

      const mediaRoot = await this.fileService.getMediaRoot();
      const physicalPath = path.join(mediaRoot, previewPath);
      const ext = path.extname(previewPath).toLowerCase();
      
      const contentType = ext === '.mp4' ? 'video/mp4' : 'image/webp';
      return reply.type(contentType).send(fs.createReadStream(physicalPath));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async getWaveform(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const { id } = request.params;
      const mediaFile = await this.fileService.getFileById(id);
      if (!mediaFile) return reply.status(404).send({ error: 'File not found' });

      const waveformPath = mediaFile.metadata?.waveformPath;
      if (!waveformPath) {
        return reply.status(404).send({ error: 'Waveform not available' });
      }

      const mediaRoot = await this.fileService.getMediaRoot();
      const physicalPath = path.join(mediaRoot, waveformPath);
      
      return reply.type('application/json').send(fs.createReadStream(physicalPath));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }

  async getSubtitle(request: FastifyRequest<{ Params: { id: string, index: string } }>, reply: FastifyReply) {
    try {
      const { id, index } = request.params;
      const mediaFile = await this.fileService.getFileById(id);
      if (!mediaFile) return reply.status(404).send({ error: 'File not found' });

      const subtitles = mediaFile.metadata?.subtitles;
      if (!subtitles || !subtitles[parseInt(index)]) {
        return reply.status(404).send({ error: 'Subtitle not available' });
      }

      const mediaRoot = await this.fileService.getMediaRoot();
      const physicalPath = path.join(mediaRoot, subtitles[parseInt(index)].path);
      
      return reply.type('text/vtt').send(fs.createReadStream(physicalPath));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrorMessage(err) });
    }
  }
}
