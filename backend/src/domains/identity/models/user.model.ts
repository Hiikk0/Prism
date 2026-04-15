import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  passwordHash: string;
  recoveryKeyHash: string;
  role: 'guest' | 'user' | 'admin';
  isSystem: boolean;
  preferences: {
    backgroundType: 'waves' | 'image' | 'video' | 'none';
    backgroundMediaId?: string;
    performanceMode: 'high' | 'low';
  };
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  recoveryKeyHash: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['guest', 'user', 'admin'], 
    default: 'user' 
  },
  isSystem: { type: Boolean, default: false },
  preferences: {
    backgroundType: { 
      type: String, 
      enum: ['waves', 'image', 'video', 'none'], 
      default: 'waves' 
    },
    backgroundMediaId: { type: String },
    performanceMode: { 
      type: String, 
      enum: ['high', 'low'], 
      default: 'high' 
    }
  },
  createdAt: { type: Date, default: Date.now }
});

export const UserModel = mongoose.model<IUser>('User', UserSchema);
