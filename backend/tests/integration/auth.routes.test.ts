import { buildApp } from '@/app';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { UserModel } from '@/domains/identity/models/user.model';
import bcrypt from 'bcryptjs';

const app = buildApp();

// Test user data
const testUser = {
  username: 'test@example.com',
  password: 'password123',
};

// Test admin user data  
const adminUser = {
  username: 'admin@example.com',
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

      expect(response.body.user.username).toBe(testUser.username);
      // Token should NOT be in the body anymore per new implementation
      expect(response.body).not.toHaveProperty('token');
      // Password must not be exposed in the response
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 409 when registering a duplicate username', async () => {
      await supertest(app.server).post('/api/auth/register').send(testUser);

      // Second registration with the same username
      const response = await supertest(app.server).post('/api/auth/register').send(testUser);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Username already exists');
    });

    it('should return 400 for invalid request data (missing password)', async () => {
      const response = await supertest(app.server)
        .post('/api/auth/register')
        .send({ username: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });
    it('should strip role and return 201 when attempting Mass Assignment via additional properties (role: admin)', async () => {
      // Create first user so the hacker isn't granted 'admin' automatically
      await UserModel.create({ username: 'first@example.com', passwordHash: 'hash', recoveryKeyHash: 'hash', role: 'admin' });

      const response = await supertest(app.server)
        .post('/api/auth/register')
        .send({ ...testUser, username: 'hacker@example.com', role: 'admin' });

      expect(response.status).toBe(201);
      expect(response.body.user.role).toBe('user');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login an existing user and set a cookie', async () => {
      const passwordHash = await bcrypt.hash(testUser.password, 10);
      await UserModel.create({ username: testUser.username, passwordHash, recoveryKeyHash: 'fake_hash', role: 'user' });

      const response = await supertest(app.server)
        .post('/api/auth/login')
        .send(testUser);

      expect(response.status).toBe(200);
      
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=');
      expect(cookies[0]).toContain('HttpOnly');
      
      expect(response.body.user.username).toBe(testUser.username);
    });

    it('should return 401 for wrong password', async () => {
      const passwordHash = await bcrypt.hash(testUser.password, 10);
      await UserModel.create({ username: testUser.username, passwordHash, recoveryKeyHash: 'fake_hash', role: 'user' });

      const response = await supertest(app.server)
        .post('/api/auth/login')
        .send({ username: testUser.username, password: 'WRONG_PASSWORD' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for a non-existent user', async () => {
      const response = await supertest(app.server)
        .post('/api/auth/login')
        .send({ username: 'ghost@example.com', password: 'password123' });

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
        .send({ username: 'me@example.com', password: 'password123' });
      
      const cookie = authResponse.headers['set-cookie'][0];
      
      const response = await supertest(app.server)
        .get('/api/auth/me')
        .set('Cookie', [cookie]);

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('me@example.com');
      expect(response.body.user.role).toBe('admin');
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
      // Create first user so the next one isn't an admin
      await UserModel.create({ username: 'first@example.com', passwordHash: 'hash', recoveryKeyHash: 'hash', role: 'admin' });

      const registerResponse = await supertest(app.server)
        .post('/api/auth/register')
        .send(testUser);

      const cookie = registerResponse.headers['set-cookie'][0];

      const response = await supertest(app.server)
        .get('/api/admin/settings')
        .set('Cookie', [cookie]);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: Insufficient permissions');
    });

    it('should allow access (200) when user has admin role', async () => {
      const passwordHash = await bcrypt.hash(adminUser.password, 10);
      await UserModel.create({ username: adminUser.username, passwordHash, recoveryKeyHash: 'fake_admin_hash', role: 'admin' });

      const loginResponse = await supertest(app.server)
        .post('/api/auth/login')
        .send(adminUser);

      const cookie = loginResponse.headers['set-cookie'][0];

      const response = await supertest(app.server)
        .get('/api/admin/settings')
        .set('Cookie', [cookie]);

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should return 401 when no token cookie is provided', async () => {
      const response = await supertest(app.server).get('/api/admin/settings');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized: No token provided');
    });

    it('should return 401 when an invalid token cookie is provided', async () => {
      const response = await supertest(app.server)
        .get('/api/admin/settings')
        .set('Cookie', ['token=invalid-token']);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized: Invalid token');
    });
  });
});
