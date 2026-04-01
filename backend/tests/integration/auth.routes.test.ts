import { buildApp } from '@/app';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { UserModel } from '@/domains/identity/models/user.model';
import bcrypt from 'bcryptjs';

const app = buildApp();

// Test user data
const testUser = {
  email: 'test@example.com',
  password: 'password123',
};

// Test admin user data  
const adminUser = {
  email: 'admin@example.com',
  password: 'adminpassword123',
};

beforeAll(async () => {
  await app.ready();
  // Using a local mongo for tests, ensuring it's connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://localhost:27017/media-server-test');
  }
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.close();
  await app.close();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
});

describe('Auth Routes & Middleware', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user and set a cookie', async () => {
      const response = await supertest(app.server)
        .post('/api/auth/register')
        .send(testUser);

      expect(response.status).toBe(201);
      
      // Check for HttpOnly cookie
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=');
      expect(cookies[0]).toContain('HttpOnly');

      expect(response.body.user.email).toBe(testUser.email);
      // Token should NOT be in the body anymore per new implementation
      expect(response.body).not.toHaveProperty('token');
      // Password must not be exposed in the response
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 409 when registering a duplicate email', async () => {
      await supertest(app.server).post('/api/auth/register').send(testUser);

      // Second registration with the same email
      const response = await supertest(app.server).post('/api/auth/register').send(testUser);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already exists');
    });

    it('should return 400 for invalid request data (missing password)', async () => {
      const response = await supertest(app.server)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login an existing user and set a cookie', async () => {
      const passwordHash = await bcrypt.hash(testUser.password, 10);
      await UserModel.create({ email: testUser.email, passwordHash, role: 'user' });

      const response = await supertest(app.server)
        .post('/api/auth/login')
        .send(testUser);

      expect(response.status).toBe(200);
      
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=');
      expect(cookies[0]).toContain('HttpOnly');
      
      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should return 401 for wrong password', async () => {
      const passwordHash = await bcrypt.hash(testUser.password, 10);
      await UserModel.create({ email: testUser.email, passwordHash, role: 'user' });

      const response = await supertest(app.server)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'WRONG_PASSWORD' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for a non-existent user', async () => {
      const response = await supertest(app.server)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 if no cookies provided', async () => {
      const response = await supertest(app.server).get('/api/auth/me');
      expect(response.status).toBe(401);
    });

    it('should return user info if verified token in cookie', async () => {
      // First register to get cookie
      const authResponse = await supertest(app.server)
        .post('/api/auth/register')
        .send({ email: 'me@example.com', password: 'password123' });
      
      const cookie = authResponse.headers['set-cookie'][0];
      
      const response = await supertest(app.server)
        .get('/api/auth/me')
        .set('Cookie', [cookie]);

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('me@example.com');
      expect(response.body.user.role).toBe('user');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the token cookie', async () => {
      const response = await supertest(app.server)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out successfully');
      
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=;');
      expect(cookies[0]).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    });
  });

  describe('RBAC Middleware & Cookies', () => {
    it('should deny access (403) when user lacks required role', async () => {
      const registerResponse = await supertest(app.server)
        .post('/api/auth/register')
        .send(testUser);

      const cookie = registerResponse.headers['set-cookie'][0];

      const response = await supertest(app.server)
        .get('/protected')
        .set('Cookie', [cookie]);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: Insufficient permissions');
    });

    it('should allow access (200) when user has admin role', async () => {
      const passwordHash = await bcrypt.hash(adminUser.password, 10);
      await UserModel.create({ email: adminUser.email, passwordHash, role: 'admin' });

      const loginResponse = await supertest(app.server)
        .post('/api/auth/login')
        .send(adminUser);

      const cookie = loginResponse.headers['set-cookie'][0];

      const response = await supertest(app.server)
        .get('/protected')
        .set('Cookie', [cookie]);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('should return 401 when no token cookie is provided', async () => {
      const response = await supertest(app.server).get('/protected');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized: No token provided');
    });

    it('should return 401 when an invalid token cookie is provided', async () => {
      const response = await supertest(app.server)
        .get('/protected')
        .set('Cookie', ['token=invalid-token']);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized: Invalid token');
    });
  });
});
