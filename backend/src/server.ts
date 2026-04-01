import { buildApp } from './app';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

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

    // Start server
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server listening on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
