import { buildApp } from '@/app';
import supertest from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';

process.env.NODE_ENV = 'test';
const app = buildApp();
const logFilePath = path.join(__dirname, '../../logs/security.log');

beforeAll(async () => {
  await app.ready();
  // Ensure DB is connected for auth routes to work without timeout
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://localhost:27017/media-server-test');
  }
  
  // Clear any existing logs before test
  try {
    await fs.rm(logFilePath, { force: true });
  } catch (e) {}
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Security Hardening (Phase 3) - Security Logging', () => {
  
  test('Step 3.3: Should create a log entry in logs/security.log on failed login', async () => {
     // Triggering a failed login
     const response = await supertest(app.server)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'wrongpassword' });
      
     // Expected to be 401
     expect(response.status).toBe(401);
     
     // Green phase: The log file should now exist and contain our FAILED_LOGIN event.
     // pino-roll writes asynchronously via a worker thread, so we poll for changes.
     const logDir = path.dirname(logFilePath);
     
     let foundLog = false;
     for (let attempt = 0; attempt < 5; attempt++) {
       await new Promise(resolve => setTimeout(resolve, 500)); // wait 500ms
       
       const files = await fs.readdir(logDir).catch(() => []);
       const securityLogs = files.filter(f => f.startsWith('security') && f.endsWith('.log'));
       
       for (const file of securityLogs) {
         const content = await fs.readFile(path.join(logDir, file), 'utf8');
         if (content.includes('FAILED_LOGIN') && content.includes('nonexistent')) {
           foundLog = true;
           break;
         }
       }

       if (foundLog) break;
     }

     expect(foundLog).toBe(true);
  });
});
