import mongoose, { Schema, Document } from 'mongoose';

export interface IPlaylist extends Document {
  name: string;
  userId: mongoose.Types.ObjectId | string;
  mediaItems: (mongoose.Types.ObjectId | string)[];
  isSystem: boolean;
  isSmartPlaylist: boolean;
  smartFilter?: {
    mimePrefix: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PlaylistSchema: Schema = new Schema({
  name: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mediaItems: [{ type: Schema.Types.ObjectId, ref: 'MediaFile' }],
  isSystem: { type: Boolean, default: false },
  isSmartPlaylist: { type: Boolean, default: false },
  smartFilter: {
    mimePrefix: { type: String }
  }
}, {
  timestamps: true
});

PlaylistSchema.index({ userId: 1 });

export const PlaylistModel = mongoose.model<IPlaylist>('Playlist', PlaylistSchema);
