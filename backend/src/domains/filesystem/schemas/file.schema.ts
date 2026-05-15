import { z } from 'zod';

export const GetFilesQuerySchema = z.object({
  type: z.string().optional(),
  parentId: z.string().optional(),
  isFolder: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
  skip: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  sortBy: z.enum(['name', 'recent']).optional(),
});

export const UploadQuerySchema = z.object({
  parentId: z.string().optional(),
});

export const CreateFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required'),
  parentId: z.string().nullable().default(null),
});

export const RenameFileSchema = z.object({
  originalName: z.string().min(1, 'Name is required'),
});

export const RenameFileParamsSchema = z.object({
  id: z.string().min(1),
});

export const MoveFilesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  targetParentId: z.string().nullable().default(null),
});

export const UpdateTagsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string()),
});

export const DeleteFilesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export type GetFilesQuery = z.infer<typeof GetFilesQuerySchema>;
export type CreateFolderPayload = z.infer<typeof CreateFolderSchema>;
export type RenameFilePayload = z.infer<typeof RenameFileSchema>;
export type MoveFilesPayload = z.infer<typeof MoveFilesSchema>;
export type UpdateTagsPayload = z.infer<typeof UpdateTagsSchema>;
export type DeleteFilesPayload = z.infer<typeof DeleteFilesSchema>;
export type UploadQuery = z.infer<typeof UploadQuerySchema>;
