import { AuthService } from '@/domains/identity/services/auth.service';
import { UserRepository } from '@/domains/identity/repositories/user.repository';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

jest.mock('@/domains/identity/repositories/user.repository');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;
    authService = new AuthService(mockUserRepository, 'test_secret');
    jest.clearAllMocks();
  });

  describe('register', () => {
    const userData = { email: 'test@example.com', password: 'password123', role: 'user' };
    const hashedPassword = 'hashedPassword';
    const savedUser = { 
      _id: '1', 
      email: 'test@example.com', 
      role: 'user',
      toObject: jest.fn().mockReturnValue({ _id: '1', email: 'test@example.com', role: 'user' })
    };

    beforeEach(() => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockUserRepository.create.mockResolvedValue(savedUser as any);
      (jwt.sign as jest.Mock).mockReturnValue('mock_token');
    });

    it('should create a user and return a token', async () => {
      const result = await authService.register(userData);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        passwordHash: hashedPassword,
        role: 'user',
      });
      expect(result.token).toBe('mock_token');
      expect(result.user.email).toBe('test@example.com');
      // Ensure passwordHash is not returned in user object
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw an error if email already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({ _id: '1' } as any);

      await expect(authService.register(userData)).rejects.toThrow('Email already exists');
    });
  });

  describe('login', () => {
    const userWithHash = { 
      _id: '1', 
      email: 'test@example.com', 
      passwordHash: 'hashedPassword', 
      role: 'user',
      toObject: jest.fn().mockReturnValue({ _id: '1', email: 'test@example.com', role: 'user' })
    };

    beforeEach(() => {
      mockUserRepository.findByEmail.mockResolvedValue(userWithHash as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('mock_token');
    });

    it('should login a user and return a token with correct credentials', async () => {
      const result = await authService.login('test@example.com', 'password123');

      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: '1', email: 'test@example.com', role: 'user' }, 
        'test_secret', 
        { expiresIn: '1d' }
      );
      expect(result.token).toBe('mock_token');
      expect(result.user.email).toBe('test@example.com');
      // Critical: passwordHash must be stripped from the response
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw an error when user is not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.login('test@example.com', 'wrongpassword')).rejects.toThrow('Invalid credentials');
    });

    it('should throw an error when password does not match', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login('test@example.com', 'wrongpassword')).rejects.toThrow('Invalid credentials');
    });

    describe('edge cases', () => {
      it('should propagate bcrypt hash errors during registration', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(null);
        (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('hash failed'));

        await expect(authService.register({ email: 'test@example.com', password: 'password123', role: 'user' })).rejects.toThrow('hash failed');
      });

      it('should propagate repository errors during login', async () => {
        mockUserRepository.findByEmail.mockRejectedValue(new Error('db error'));

        await expect(authService.login('test@example.com', 'password123')).rejects.toThrow('db error');
      });

      it('should return user object without password even if repository returns plain object with password field', async () => {
        const plainUser = { 
          _id: '1', 
          email: 'plain@example.com', 
          passwordHash: 'plainHash', 
          role: 'user',
          toObject: jest.fn().mockReturnValue({ _id: '1', email: 'plain@example.com', role: 'user' })
        };
        mockUserRepository.findByEmail.mockResolvedValue(plainUser as any);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        (jwt.sign as jest.Mock).mockReturnValue('token');

        const result = await authService.login('plain@example.com', 'password123');
        expect(result.user).not.toHaveProperty('passwordHash');
        expect(result.user).not.toHaveProperty('password');
      });
    });
  });
});
