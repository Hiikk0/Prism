import { z } from 'zod';

export const CreatePlaylistSchema = z.object({
  name: z.string().min(1).max(100)
});

export const UpdatePlaylistMediaSchema = z.object({
  mediaId: z.string()
});

export const SaveProgressSchema = z.object({
  mediaId: z.string(),
  currentTime: z.number().min(0)
});
