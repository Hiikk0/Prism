import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const RegisterSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const ResetPasswordSchema = z.object({
  username: z.string().min(1),
  recoveryKey: z.string().min(1),
  newPassword: z.string().min(6),
});

export const UpdateProfileSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  preferences: z.object({
    backgroundType: z.enum(['waves', 'image', 'video', 'none']).optional(),
    backgroundMediaId: z.string().optional(),
    performanceMode: z.enum(['high', 'low']).optional(),
  }).optional(),
});

export type LoginPayload = z.infer<typeof LoginSchema>;
export type RegisterPayload = z.infer<typeof RegisterSchema>;
export type ResetPasswordPayload = z.infer<typeof ResetPasswordSchema>;
export type UpdateProfilePayload = z.infer<typeof UpdateProfileSchema>;
