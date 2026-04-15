import { buildApp } from '@/app';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { UserModel } from '@/domains/identity/models/user.model';
import { MediaFileModel } from '@/domains/filesystem/models/mediafile.model';
import path from 'path';
import fs from 'fs/promises';

const MEDIA_ROOT = path.join(__dirname, '../../tmp_media_filter');
process.env.MEDIA_ROOT_DIRECTORY = MEDIA_ROOT;
const app = buildApp();

describe('FileSystem Filtering (Folders visibility)', () => {
  const testUser = { username: 'filter_test@example.com', password: 'password123' };
  let userCookie: string;
  let userId: string;

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
    
    // Create user
    const res = await supertest(app.server).post('/api/auth/register').send(testUser);
    userCookie = res.headers['set-cookie'][0];
    userId = res.body.user._id;

    // Setup: Create a folder and a video file in root
    // Folder
    await new MediaFileModel({
      originalName: 'My Folder',
      savedName: 'folder_123',
      path: 'folder_123',
      mimeType: 'directory',
      size: 0,
      uploadedBy: new mongoose.Types.ObjectId(userId),
      isFolder: true,
      parentId: null
    }).save();

    // Video file
    await new MediaFileModel({
      originalName: 'video.mp4',
      savedName: 'video_123.mp4',
      path: 'video_123.mp4',
      mimeType: 'video/mp4',
      size: 1024,
      uploadedBy: new mongoose.Types.ObjectId(userId),
      isFolder: false,
      parentId: null
    }).save();
  });

  it('should return BOTH video and folder when filtering by type=video', async () => {
    const response = await supertest(app.server)
      .get('/api/files?type=video')
      .set('Cookie', [userCookie]);

    expect(response.status).toBe(200);
    const items = response.body.items;
    
    const folder = items.find((i: any) => i.isFolder === true);
    const video = items.find((i: any) => i.mimeType.startsWith('video/'));

    expect(video).toBeDefined();
    expect(folder).toBeDefined(); // THIS IS EXPECTED TO FAIL CURRENTLY
  });

  it('should return ONLY video when explicitly using isFolder=false', async () => {
    const response = await supertest(app.server)
      .get('/api/files?type=video&isFolder=false')
      .set('Cookie', [userCookie]);

    expect(response.status).toBe(200);
    const items = response.body.items;
    
    expect(items.length).toBe(1);
    expect(items[0].isFolder).toBe(false);
  });
});
