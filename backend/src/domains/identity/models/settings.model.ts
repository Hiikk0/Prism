import mongoose, { Schema, Document } from 'mongoose';

export interface IGpuConfig {
  encoderType: string;
  codecType: string;
  multiGpuPool: boolean;
  preferredDevice: string;
  previewConcurrency: number;
}

export interface ISettings extends Document {
  registrationEnabled: boolean;
  guestLoginEnabled: boolean;
  mediaRootDirectory: string;
  usePolling: boolean;
  pollingInterval: number;
  scannerConcurrency: number;
  scannerIoConcurrency: number;
  transcodeMode: 'JIT' | 'DISK' | 'OFF';
  /** @deprecated Use gpuConfig.preferredCodec instead. Kept for backward compatibility. */
  hardwareEncoder: 'cpu_h264' | 'cpu_h265' | 'cpu_av1' | 'cpu_vp9' | 'nvenc' | 'amf' | 'qsv' | 'qsv_deeplink' | 'videotoolbox';
  gpuConfig: IGpuConfig;
  targetQualities: number[];
  keepJitResumeCache: boolean;
  updatedAt: Date;
}

const GpuConfigSchema = new Schema({
  encoderType: { type: String, default: 'auto' },
  codecType: { type: String, default: 'auto' },
  multiGpuPool: { type: Boolean, default: true },
  preferredDevice: { type: String, default: 'auto' },
  previewConcurrency: { type: Number, default: 1 },
}, { _id: false });

const SettingsSchema: Schema = new Schema({
  registrationEnabled: { type: Boolean, default: true },
  guestLoginEnabled: { type: Boolean, default: false },
  mediaRootDirectory: { type: String, required: true },
  usePolling: { type: Boolean, default: false },
  pollingInterval: { type: Number, default: 100 },
  scannerConcurrency: { type: Number, default: 2 },
  scannerIoConcurrency: { type: Number, default: 10 },
  transcodeMode: { type: String, enum: ['JIT', 'DISK', 'OFF'], default: 'OFF' },
  hardwareEncoder: { 
    type: String, 
    enum: ['cpu_h264', 'cpu_h265', 'cpu_av1', 'cpu_vp9', 'nvenc', 'amf', 'qsv', 'qsv_deeplink', 'videotoolbox'],
    default: 'cpu_h264'
  },
  gpuConfig: { type: GpuConfigSchema, default: () => ({}) },
  targetQualities: { type: [Number], default: [1080, 720, 480] },
  keepJitResumeCache: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});

export const SettingsModel = mongoose.model<ISettings>('Settings', SettingsSchema);

