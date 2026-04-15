import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRepository } from '../repositories/user.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { securityLogger } from '../../../shared/services/security-logger.service';

export class AuthService {
  constructor(
    private userRepository: UserRepository, 
    private settingsRepository: SettingsRepository,
    private jwtSecret: string
  ) {}

  async register(data: any): Promise<any> {
    const settings = await this.settingsRepository.getSettings();
    const realUserCount = await this.userRepository.countDocuments({ isSystem: false });
    
    // Only block registration if not the first user
    if (realUserCount > 0 && settings && !settings.registrationEnabled) {
      throw new Error('Registration is currently disabled');
    }

    const existingUser = await this.userRepository.findByUsername(data.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // First real user is admin
    const role = realUserCount === 0 ? 'admin' : 'user';

    // Generate Recovery Key
    const recoveryKey = crypto.randomBytes(16).toString('hex');
    const recoveryKeyHash = await bcrypt.hash(recoveryKey, 10);
    const passwordHash = await bcrypt.hash(data.password, 10);

    const savedUser = await this.userRepository.create({
      username: data.username,
      passwordHash,
      recoveryKeyHash,
      role,
    });

    securityLogger.logEvent('ACCOUNT_CREATED', { username: data.username, role });

    const tokens = this.generateTokens(savedUser);
    
    const userObj = savedUser.toObject();
    const { passwordHash: _, recoveryKeyHash: __, ...userWithoutSecrets } = userObj;
    
    return { 
      user: userWithoutSecrets, 
      ...tokens,
      recoveryKey // Plaintext only once on registration
    };
  }

  async login(username: string, password: string): Promise<any> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      securityLogger.logEvent('FAILED_LOGIN', { username, reason: 'User not found' });
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      securityLogger.logEvent('FAILED_LOGIN', { username, reason: 'Invalid password' });
      throw new Error('Invalid credentials');
    }

    securityLogger.logEvent('SUCCESSFUL_LOGIN', { username, role: user.role });

    const tokens = this.generateTokens(user);
    
    const userObj = user.toObject();
    const { passwordHash: _, recoveryKeyHash: __, ...userWithoutSecrets } = userObj;
    
    return { user: userWithoutSecrets, ...tokens };
  }

  async resetPassword(username: string, recoveryKey: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      securityLogger.logEvent('FAILED_PASSWORD_RESET', { username, reason: 'User not found' });
      throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(recoveryKey, user.recoveryKeyHash);
    if (!isValid) {
      securityLogger.logEvent('FAILED_PASSWORD_RESET', { username, reason: 'Invalid recovery key' });
      throw new Error('Invalid recovery key');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(user._id.toString(), { passwordHash });
    
    securityLogger.logEvent('PASSWORD_RESET', { username });
  }

  async guestLogin(): Promise<any> {
    const settings = await this.settingsRepository.getSettings();
    if (!settings || !settings.guestLoginEnabled) {
      throw new Error('Guest login is disabled');
    }

    // Check if guest user already exists or create a unique one for this session
    // requirement says "створиться користувач з іменем-uuid"
    const guestUsername = `guest-${crypto.randomUUID()}`;
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const recoveryKeyHash = await bcrypt.hash('n/a', 10); // Guests don't need recovery

    const guestUser = await this.userRepository.create({
      username: guestUsername,
      passwordHash,
      recoveryKeyHash,
      role: 'guest'
    });

    const tokens = this.generateTokens(guestUser, '1h'); // Short-lived for guests
    
    return {
      user: {
        id: guestUser._id,
        username: guestUsername,
        role: 'guest'
      },
      ...tokens
    };
  }

  async getPublicSettings(): Promise<any> {
    const settings = await this.settingsRepository.getSettings();
    return {
      registrationEnabled: settings?.registrationEnabled ?? true,
      guestLoginEnabled: settings?.guestLoginEnabled ?? false,
    };
  }

  private generateTokens(user: any, expiry: string | number = '1d'): { accessToken: string, refreshToken: string } {
    const accessToken = jwt.sign(
      { id: user._id, username: user.username, role: user.role }, 
      this.jwtSecret, 
      { expiresIn: expiry } as jwt.SignOptions
    );
    
    const refreshToken = jwt.sign(
      { id: user._id, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: '7d' } as jwt.SignOptions
    );

    return { accessToken, refreshToken };
  }
}
