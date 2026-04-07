import { buildApp } from '@/app';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { UserModel } from '@/domains/identity/models/user.model';
import { MediaFileModel } from '@/domains/filesystem/models/mediafile.model';
import path from 'path';
import fs from 'fs/promises';

const MEDIA_ROOT = path.join(__dirname, '../../tmp_media');
process.env.MEDIA_ROOT_DIRECTORY = MEDIA_ROOT;
const app = buildApp();

beforeAll(async () => {
  await app.ready();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://localhost:27017/media-server-test');
  }
  await mongoose.connection.dropDatabase();
  await fs.mkdir(MEDIA_ROOT, { recursive: true });
});

afterAll(async () => {
  await mongoose.connection.close();
  await app.close();
  await fs.rm(MEDIA_ROOT, { recursive: true, force: true });
});

beforeEach(async () => {
  await UserModel.deleteMany({});
  await MediaFileModel.deleteMany({});
  const files = await fs.readdir(MEDIA_ROOT);
  for (const file of files) {
    await fs.unlink(path.join(MEDIA_ROOT, file));
  }
});

describe('FileSystem Routes', () => {
  const testUser = { username: 'user@example.com', password: 'password123' };
  let userCookie: string;
  let userId: string;

  beforeEach(async () => {
    const res = await supertest(app.server).post('/api/auth/register').send(testUser);
    if (res.status !== 201) {
      throw new Error(`Failed to register test user: ${res.status} ${JSON.stringify(res.body)}`);
    }
    userCookie = res.headers['set-cookie'][0];
    userId = res.body.user._id;
  });

  describe('POST /api/files', () => {
    it('should upload a file and return 201', async () => {
      const response = await supertest(app.server)
        .post('/api/files')
        .set('Cookie', [userCookie])
        .attach('file', Buffer.from('fake video content'), 'video.mp4');

      expect(response.status).toBe(201);
      expect(response.body.originalName).toBe('video.mp4');
      
      const fileInDb = await MediaFileModel.findOne({ originalName: 'video.mp4' });
      expect(fileInDb).toBeDefined();
      const filePath = path.join(MEDIA_ROOT, fileInDb!.savedName);
      await expect(fs.access(filePath)).resolves.toBeUndefined();
    });

    it('should return 401 if not logged in', async () => {
      const response = await supertest(app.server)
        .post('/api/files')
        .attach('file', Buffer.from('data'), 'test.txt');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/files', () => {
    it('should return a list of files', async () => {
      await MediaFileModel.create({
        originalName: 'test.mp4',
        savedName: 'saved.mp4',
        path: 'saved.mp4',
        mimeType: 'video/mp4',
        size: 100,
        uploadedBy: new mongoose.Types.ObjectId(userId)
      });

      const response = await supertest(app.server)
        .get('/api/files')
        .set('Cookie', [userCookie]);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].originalName).toBe('test.mp4');
    });

    it('should filter files by type', async () => {
      await MediaFileModel.create([
        { originalName: 'movie.mp4', savedName: '1.mp4', path: '1.mp4', mimeType: 'video/mp4', size: 100, uploadedBy: new mongoose.Types.ObjectId(userId) },
        { originalName: 'song.mp3', savedName: '2.mp3', path: '2.mp3', mimeType: 'audio/mpeg', size: 50, uploadedBy: new mongoose.Types.ObjectId(userId) }
      ]);

      const response = await supertest(app.server)
        .get('/api/files?type=video')
        .set('Cookie', [userCookie]);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].originalName).toBe('movie.mp4');
    });
  });

  describe('PUT /api/files/:id', () => {
    it('should allow owner to rename file in DB', async () => {
      const mediaFile = await MediaFileModel.create({
        originalName: 'oldName.mp4',
        savedName: 'saved.mp4',
        path: 'saved.mp4',
        mimeType: 'video/mp4',
        size: 100,
        uploadedBy: new mongoose.Types.ObjectId(userId)
      });

      const response = await supertest(app.server)
        .put(`/api/files/${mediaFile._id}`)
        .set('Cookie', [userCookie])
        .send({ originalName: 'newName.mp4' });

      expect(response.status).toBe(200);
      expect(response.body.originalName).toBe('newName.mp4');

      const fileInDb = await MediaFileModel.findById(mediaFile._id);
      expect(fileInDb!.originalName).toBe('newName.mp4');
    });

    it('should refuse to rename if not owner', async () => {
      const otherUserRes = await supertest(app.server).post('/api/auth/register').send({ username: 'other_rename@ex.com', password: 'password' });
      const otherCookie = otherUserRes.headers['set-cookie'][0];

      const mediaFile = await MediaFileModel.create({
        originalName: 'owner.file',
        savedName: 'owner.file',
        path: 'owner.file',
        mimeType: 'text/plain',
        size: 10,
        uploadedBy: new mongoose.Types.ObjectId(userId)
      });

      const response = await supertest(app.server)
        .put(`/api/files/${mediaFile._id}`)
        .set('Cookie', [otherCookie])
        .send({ originalName: 'hacked.file' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should allow owner to delete file', async () => {
      const mediaFile = await MediaFileModel.create({
        originalName: 'delete.me',
        savedName: 'tobedeleted.txt',
        path: 'tobedeleted.txt',
        mimeType: 'text/plain',
        size: 10,
        uploadedBy: new mongoose.Types.ObjectId(userId)
      });
      const filePath = path.join(MEDIA_ROOT, 'tobedeleted.txt');
      await fs.writeFile(filePath, 'some content');

      const response = await supertest(app.server)
        .delete(`/api/files`)
        .set('Cookie', [userCookie])
        .send({ ids: [mediaFile._id] });

      expect(response.status).toBe(204);
      await expect(fs.access(filePath)).rejects.toThrow();
      const fileInDb = await MediaFileModel.findById(mediaFile._id);
      expect(fileInDb).toBeNull();
    });

    it('should refuse to delete if not owner', async () => {
      const otherUserRes = await supertest(app.server).post('/api/auth/register').send({ username: 'other@ex.com', password: 'password' });
      const otherCookie = otherUserRes.headers['set-cookie'][0];

      const mediaFile = await MediaFileModel.create({
        originalName: 'owner.file',
        savedName: 'owner.file',
        path: 'owner.file',
        mimeType: 'text/plain',
        size: 10,
        uploadedBy: new mongoose.Types.ObjectId(userId)
      });

      const response = await supertest(app.server)
        .delete(`/api/files`)
        .set('Cookie', [otherCookie])
        .send({ ids: [mediaFile._id] });

      expect(response.status).toBe(204);
      const fileInDb = await MediaFileModel.findById(mediaFile._id);
      expect(fileInDb).not.toBeNull();
    });
  });
});
