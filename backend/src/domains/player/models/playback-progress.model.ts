import mongoose, { Schema, Document } from 'mongoose';

export interface IPlaybackProgress extends Document {
  userId: mongoose.Types.ObjectId | string;
  mediaId: mongoose.Types.ObjectId | string;
  currentTime: number;
  updatedAt: Date;
}

const PlaybackProgressSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mediaId: { type: Schema.Types.ObjectId, ref: 'MediaFile', required: true },
  currentTime: { type: Number, required: true, default: 0 }
}, {
  timestamps: true
});

PlaybackProgressSchema.index({ userId: 1, mediaId: 1 }, { unique: true });
PlaybackProgressSchema.index({ userId: 1, updatedAt: -1 });

export const PlaybackProgressModel = mongoose.model<IPlaybackProgress>('PlaybackProgress', PlaybackProgressSchema);
