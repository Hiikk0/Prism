import { z } from 'zod';

export const UpdateSettingsSchema = z.object({
  registrationEnabled: z.boolean().optional(),
  guestLoginEnabled: z.boolean().optional(),
  mediaRootDirectory: z.string().min(1).optional(),
  usePolling: z.boolean().optional(),
  pollingInterval: z.number().int().positive().optional(),
  scannerConcurrency: z.number().int().positive().optional(),
  scannerIoConcurrency: z.number().int().positive().optional(),
  createIfMissing: z.boolean().optional(), // frontend flag
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['guest', 'user', 'admin']),
});

export type UpdateSettingsPayload = z.infer<typeof UpdateSettingsSchema>;
export type UpdateUserRolePayload = z.infer<typeof UpdateUserRoleSchema>;
