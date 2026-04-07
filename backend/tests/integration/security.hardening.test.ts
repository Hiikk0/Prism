import { buildApp } from '@/app';
import supertest from 'supertest';
import mongoose from 'mongoose';

const app = buildApp();

beforeAll(async () => {
  await app.ready();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://localhost:27017/media-server-test');
  }
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe('Security Hardening (Phase 2) Integration Tests', () => {
  
  test('Should have security headers from helmet', async () => {
    const response = await supertest(app.server).get('/api/health');
    
    // Helmet headers (defaults)
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['strict-transport-security']).toBeDefined();
    // Since we disabled CSP in app.ts:
    expect(response.headers['content-security-policy']).toBeUndefined();
  });

  test('Should handle CORS properly', async () => {
    const origin = 'http://localhost:3000';
    const response = await supertest(app.server)
      .get('/api/health')
      .set('Origin', origin);
    
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('Should enforce maximum password length (128 characters) on registration', async () => {
    const longPassword = 'a'.repeat(129);
    const response = await supertest(app.server)
      .post('/api/auth/register')
      .send({
        username: 'tooLongPasswordUser@example.com',
        password: longPassword
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Validation failed');
    expect(JSON.stringify(response.body.details)).toContain('maxLength');
  });

  test('Should enforce maximum password length (128 characters) on login', async () => {
    const longPassword = 'a'.repeat(129);
    const response = await supertest(app.server)
      .post('/api/auth/login')
      .send({
        username: 'tooLongPasswordUser@example.com',
        password: longPassword
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Validation failed');
  });

  test('Should enforce maximum password length (128 characters) on reset-password', async () => {
    const longPassword = 'a'.repeat(129);
    const response = await supertest(app.server)
      .post('/api/auth/reset-password')
      .send({
        username: 'user@example.com',
        recoveryKey: 'key',
        newPassword: longPassword
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Validation failed');
  });
});
