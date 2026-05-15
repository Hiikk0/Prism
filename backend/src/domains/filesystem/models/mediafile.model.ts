import mongoose, { Schema, Document } from 'mongoose';

export interface IMediaMetadata {
  duration?: number;
  artist?: string;
  title?: string;
  album?: string;
  resolution?: string;
  thumbnailPath?: string;
  previewPath?: string;
  subtitles?: Array<{
    language: string;
    path: string;
    label: string;
  }>;
}

export interface IMediaFile extends Document {
  originalName: string;
  savedName: string;
  path: string;
  mimeType: string;
  size: number;
  uploadedBy: mongoose.Types.ObjectId | string;
  parentId?: mongoose.Types.ObjectId | string | null;
  isFolder: boolean;
  tags?: string[];
  hash?: string;
  metadata?: IMediaMetadata;
  modifiedAt?: Date;
  createdAt: Date;
}

const MediaFileSchema: Schema = new Schema({
  originalName: { type: String, required: true },
  savedName: { type: String, required: true },
  path: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'MediaFile', required: false },
  isFolder: { type: Boolean, default: false },
  tags: { type: [String], default: [] },
  hash: { type: String, required: false },
  metadata: { type: Schema.Types.Mixed, required: false },
  modifiedAt: { type: Date, required: false },
  createdAt: { type: Date, default: Date.now }
});

MediaFileSchema.index({ path: 1 }, { unique: true });
MediaFileSchema.index({ hash: 1 });

export const MediaFileModel = mongoose.model<IMediaFile>('MediaFile', MediaFileSchema);
