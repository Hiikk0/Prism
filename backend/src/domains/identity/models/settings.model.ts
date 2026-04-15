import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  registrationEnabled: boolean;
  guestLoginEnabled: boolean;
  mediaRootDirectory: string;
  usePolling: boolean;
  pollingInterval: number;
  scannerConcurrency: number;
  scannerIoConcurrency: number;
  updatedAt: Date;
}

const SettingsSchema: Schema = new Schema({
  registrationEnabled: { type: Boolean, default: true },
  guestLoginEnabled: { type: Boolean, default: false },
  mediaRootDirectory: { type: String, required: true },
  usePolling: { type: Boolean, default: false },
  pollingInterval: { type: Number, default: 100 },
  scannerConcurrency: { type: Number, default: 2 },
  scannerIoConcurrency: { type: Number, default: 10 },
  updatedAt: { type: Date, default: Date.now }
});

export const SettingsModel = mongoose.model<ISettings>('Settings', SettingsSchema);
