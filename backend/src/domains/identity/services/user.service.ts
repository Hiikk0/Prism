import { UserRepository } from '../repositories/user.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { IUser } from '../models/user.model';
import bcrypt from 'bcryptjs';

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

  async updateProfile(userId: string, data: { username?: string, password?: string }): Promise<IUser | null> {
    const updateData: any = {};
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
    return this.userRepository.update(userId, updateData);
  }

  async updateSettings(data: any): Promise<any> {
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

  async getSettings() {
    return this.settingsRepository.getSettings();
  }
}
