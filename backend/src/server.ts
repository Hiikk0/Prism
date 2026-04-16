import { buildApp } from './app';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { mkdir } from 'fs/promises';

// Load environment variables if needed
dotenv.config({ path: path.join(__dirname, '../.env') });

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/prism-media-server';

const start = async () => {
  const app = buildApp({ logger: true });

  try {
    // Connect to database
    await mongoose.connect(mongoUri);
    app.log.info('Connected to MongoDB');

    // Initialize Global Settings
    const { SettingsRepository } = await import('./domains/identity/repositories/settings.repository');
    const { UserRepository } = await import('./domains/identity/repositories/user.repository');
    const { ScannerService } = await import('./domains/filesystem/services/scanner.service');
    const { MediaProcessorService } = await import('./domains/filesystem/services/media-processor.service');
    const { MediaFileRepository } = await import('./domains/filesystem/repositories/mediafile.repository');
    const bcrypt = (await import('bcryptjs')) as typeof import('bcryptjs');

    const settingsRepo = new SettingsRepository();
    const userRepo = new UserRepository();
    const mediaRepo = new MediaFileRepository();

    const mediaRoot = process.env.MEDIA_ROOT_DIRECTORY || path.join(__dirname, '../media');
    const settings = await settingsRepo.ensureSettings(mediaRoot);
    app.log.info('System settings initialized');

    // Ensure System User exists
    let systemUser = await userRepo.findByIsSystem();
    if (!systemUser) {
      systemUser = await userRepo.create({
        username: '__system__',
        passwordHash: await bcrypt.hash(Math.random().toString(36), 10),
        recoveryKeyHash: 'n/a',
        role: 'admin',
        isSystem: true
      });
      app.log.info('System user created');
    }

    // Initialize Services
    const thumbnailDir = path.join(mediaRoot, '.cache/thumbnails');
    await mkdir(thumbnailDir, { recursive: true });

    const processor = new MediaProcessorService(mediaRepo, mediaRoot, thumbnailDir);
    const scanner = new ScannerService(mediaRepo, processor, settings.mediaRootDirectory, settingsRepo, systemUser._id.toString());
    
    await scanner.initialize();
    app.decorate('scanner', scanner);
    app.log.info('File watcher initialized');

    // Start server
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server listening on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
