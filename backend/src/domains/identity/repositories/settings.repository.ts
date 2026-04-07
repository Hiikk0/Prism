import { SettingsModel, ISettings } from '../models/settings.model';

export class SettingsRepository {
  async getSettings(): Promise<ISettings | null> {
    return SettingsModel.findOne().exec();
  }

  async updateSettings(data: Partial<ISettings>): Promise<ISettings> {
    let settings = await this.getSettings();
    if (!settings) {
      settings = new SettingsModel(data);
    } else {
      Object.assign(settings, data);
      settings.updatedAt = new Date();
    }
    return settings.save();
  }

  async ensureSettings(defaultMediaRoot: string): Promise<ISettings> {
    let settings = await this.getSettings();
    if (!settings) {
      settings = new SettingsModel({
        registrationEnabled: true,
        guestLoginEnabled: false,
        mediaRootDirectory: defaultMediaRoot,
        usePolling: false,
        pollingInterval: 100
      });
      await settings.save();
    }
    return settings;
  }
}
