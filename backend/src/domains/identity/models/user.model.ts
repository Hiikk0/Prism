import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  passwordHash: string;
  recoveryKeyHash: string;
  role: 'guest' | 'user' | 'admin';
  isSystem: boolean;
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
  createdAt: { type: Date, default: Date.now }
});

export const UserModel = mongoose.model<IUser>('User', UserSchema);
