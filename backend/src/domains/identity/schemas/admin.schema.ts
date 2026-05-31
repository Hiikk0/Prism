import { z } from 'zod';

const GpuConfigSchema = z.object({
  encoderType: z.enum(['auto','cpu','qsv','nvenc','amf','videotoolbox','vaapi','v4l2m2m','rkmpp']).optional(),
  codecType: z.enum(['auto','h264','hevc','av1','vp8','vp9','mpeg2']).optional(),
  multiGpuPool: z.boolean().optional(),
  preferredDevice: z.string().optional(),
  previewConcurrency: z.number().int().positive().optional(),
}).optional();

export const UpdateSettingsSchema = z.object({
  registrationEnabled: z.boolean().optional(),
  guestLoginEnabled: z.boolean().optional(),
  mediaRootDirectory: z.string().min(1).optional(),
  usePolling: z.boolean().optional(),
  pollingInterval: z.number().int().positive().optional(),
  scannerConcurrency: z.number().int().positive().optional(),
  scannerIoConcurrency: z.number().int().positive().optional(),
  transcodeMode: z.enum(['JIT', 'DISK', 'OFF']).optional(),
  hardwareEncoder: z.enum(['cpu_h264', 'cpu_h265', 'cpu_av1', 'cpu_vp9', 'nvenc', 'amf', 'qsv', 'qsv_deeplink', 'videotoolbox']).optional(),
  gpuConfig: GpuConfigSchema,
  targetQualities: z.array(z.number()).optional(),
  keepJitResumeCache: z.boolean().optional(),
  createIfMissing: z.boolean().optional(), // frontend flag
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['guest', 'user', 'admin']),
});

export type UpdateSettingsPayload = z.infer<typeof UpdateSettingsSchema>;
export type UpdateUserRolePayload = z.infer<typeof UpdateUserRoleSchema>;
