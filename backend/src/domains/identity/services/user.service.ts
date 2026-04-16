import { UserRepository } from '../repositories/user.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { IUser } from '../models/user.model';
import { ISettings } from '../models/settings.model';
import bcrypt from 'bcryptjs';
import { UpdateProfilePayload } from '../schemas/auth.schema';

export class UserService {
  constructor(
    private userRepository: UserRepository,
    private settingsRepository: SettingsRepository
  ) {}

  async listUsers(): Promise<IUser[]> {
    return this.userRepository.findAll();
  }

  async updateUserRole(userId: string, role: 'user' | 'admin' | 'guest'): Promise<IUser | null> {
    return this.userRepository.update(userId, { role });
  }

  async updateProfile(userId: string, data: UpdateProfilePayload): Promise<IUser | null> {
    const updateData: Partial<IUser> = {};
    if (data.username) {
      const existing = await this.userRepository.findByUsername(data.username);
      if (existing && existing._id.toString() !== userId) {
        throw new Error('Username already exists');
      }
      updateData.username = data.username;
    }
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }
    if (data.preferences) {
      // Get current user to merge preferences
      const user = await this.userRepository.findById(userId);
      updateData.preferences = {
        ...(user?.preferences || {}),
        ...data.preferences
      } as IUser['preferences'];
    }
    return this.userRepository.update(userId, updateData);
  }

  async updateSettings(data: Record<string, unknown>): Promise<ISettings | null> {
    const currentSettings = await this.settingsRepository.getSettings();
    
    // If guest login is being disabled, cleanup guest users
    if (currentSettings?.guestLoginEnabled && data.guestLoginEnabled === false) {
      const users = await this.userRepository.findAll();
      const guestUsers = users.filter(u => u.role === 'guest');
      for (const guest of guestUsers) {
        await this.userRepository.delete(guest._id.toString());
      }
    }

    return this.settingsRepository.updateSettings(data);
  }

  async getSettings(): Promise<ISettings | null> {
    return this.settingsRepository.getSettings();
  }
}
