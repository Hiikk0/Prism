import { AuthService } from '@/domains/identity/services/auth.service';
import { UserRepository } from '@/domains/identity/repositories/user.repository';
import { SettingsRepository } from '@/domains/identity/repositories/settings.repository';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';

jest.mock('@/domains/identity/repositories/user.repository');
jest.mock('@/domains/identity/repositories/settings.repository');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockSettingsRepository: jest.Mocked<SettingsRepository>;

  const jwtSecret = 'test_secret';

  beforeEach(() => {
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;
    mockSettingsRepository = new SettingsRepository() as jest.Mocked<SettingsRepository>;
    authService = new AuthService(mockUserRepository, mockSettingsRepository, jwtSecret);
    jest.clearAllMocks();
    
    // Default settings
    mockSettingsRepository.getSettings.mockResolvedValue({
      registrationEnabled: true,
      guestLoginEnabled: false,
      mediaRootDirectory: '/tmp/media'
    } as any);
  });

  describe('register', () => {
    const userData = { username: 'testuser', password: 'password123' };
    const hashedPassword = 'hashedPassword';
    const hashedRecoveryKey = 'hashedRecoveryKey';

    beforeEach(() => {
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.count.mockResolvedValue(1); // Not the first user
      (bcrypt.hash as jest.Mock).mockImplementation((val) => Promise.resolve(`hashed_${val}`));
    });

    it('should create a user, generate a recovery key, and return tokens', async () => {
      const savedUser = { 
        _id: '1', 
        username: 'testuser', 
        role: 'user',
        toObject: jest.fn().mockReturnValue({ _id: '1', username: 'testuser', role: 'user' })
      };
      mockUserRepository.create.mockResolvedValue(savedUser as any);
      (jwt.sign as jest.Mock).mockReturnValue('mock_token');

      const result = await authService.register(userData);

      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith('testuser');
      expect(mockUserRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        username: 'testuser',
        passwordHash: 'hashed_password123',
        recoveryKeyHash: expect.stringContaining('hashed_'),
        role: 'user'
      }));
      expect(result.accessToken).toBe('mock_token');
      expect(result.refreshToken).toBe('mock_token');
      expect(result.recoveryKey).toBeDefined(); // Plaintext for user
    });

    it('should set role as admin for the first user', async () => {
      mockUserRepository.count.mockResolvedValue(0); // First user
      const savedUser = { 
        _id: 'admin1', 
        username: 'admin', 
        role: 'admin',
        toObject: jest.fn().mockReturnValue({ _id: 'admin1', username: 'admin', role: 'admin' })
      };
      mockUserRepository.create.mockResolvedValue(savedUser as any);

      await authService.register({ username: 'admin', password: 'adminpassword' });

      expect(mockUserRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        role: 'admin'
      }));
    });

    it('should throw error if registration is disabled', async () => {
      mockSettingsRepository.getSettings.mockResolvedValue({
        registrationEnabled: false
      } as any);

      await expect(authService.register(userData)).rejects.toThrow('Registration is currently disabled');
    });

    it('should allow first user even if registration is disabled', async () => {
      mockSettingsRepository.getSettings.mockResolvedValue({
        registrationEnabled: false
      } as any);
      mockUserRepository.count.mockResolvedValue(0);
      mockUserRepository.create.mockResolvedValue({ toObject: () => ({}) } as any);

      await authService.register(userData);
      expect(mockUserRepository.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const user = { 
      _id: '1', 
      username: 'testuser', 
      passwordHash: 'hashed_pass', 
      role: 'user',
      toObject: jest.fn().mockReturnValue({ _id: '1', username: 'testuser', role: 'user' })
    };

    beforeEach(() => {
      mockUserRepository.findByUsername.mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('mock_token');
    });

    it('should return tokens for valid credentials', async () => {
      const result = await authService.login('testuser', 'password123');

      expect(result.accessToken).toBe('mock_token');
      expect(result.refreshToken).toBe('mock_token');
      expect(result.user.username).toBe('testuser');
    });

    it('should throw error for invalid credentials', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(authService.login('testuser', 'wrong')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('password recovery', () => {
    const user = { 
      _id: '1', 
      username: 'testuser', 
      recoveryKeyHash: 'hashed_key',
      toObject: jest.fn().mockReturnValue({ _id: '1', username: 'testuser' })
    };

    it('should reset password with valid recovery key', async () => {
      mockUserRepository.findByUsername.mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new_hash');

      await authService.resetPassword('testuser', 'plain_key', 'new_pass');

      expect(mockUserRepository.update).toHaveBeenCalledWith('1', {
        passwordHash: 'new_hash'
      });
    });

    it('should throw error with invalid recovery key', async () => {
      mockUserRepository.findByUsername.mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.resetPassword('testuser', 'wrong_key', 'new_pass'))
        .rejects.toThrow('Invalid recovery key');
    });
  });

  describe('guest login', () => {
    it('should create guest user if allowed', async () => {
      mockSettingsRepository.getSettings.mockResolvedValue({ guestLoginEnabled: true } as any);
      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue({ 
        _id: 'guest1', 
        username: 'guest-uuid', 
        role: 'guest',
        toObject: () => ({ username: 'guest' })
      } as any);
      (jwt.sign as jest.Mock).mockReturnValue('guest_token');

      const result = await authService.guestLogin();

      expect(result.accessToken).toBe('guest_token');
      expect(mockUserRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        role: 'guest'
      }));
    });

    it('should throw error if guest login disabled', async () => {
      mockSettingsRepository.getSettings.mockResolvedValue({ guestLoginEnabled: false } as any);
      await expect(authService.guestLogin()).rejects.toThrow('Guest login is disabled');
    });
  });
});
