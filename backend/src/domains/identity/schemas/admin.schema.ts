import { z } from 'zod';

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
  targetQualities: z.array(z.number()).optional(),
  keepJitResumeCache: z.boolean().optional(),
  createIfMissing: z.boolean().optional(), // frontend flag
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['guest', 'user', 'admin']),
});

export type UpdateSettingsPayload = z.infer<typeof UpdateSettingsSchema>;
export type UpdateUserRolePayload = z.infer<typeof UpdateUserRoleSchema>;
