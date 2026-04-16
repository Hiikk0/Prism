import { UserModel, IUser } from '../models/user.model';

export class UserRepository {
  async findByUsername(username: string): Promise<IUser | null> {
    return UserModel.findOne({ username }).exec();
  }

  async findById(id: string): Promise<IUser | null> {
    return UserModel.findById(id).exec();
  }

  async countDocuments(filter: Record<string, unknown> = {}): Promise<number> {
    return UserModel.countDocuments(filter).exec();
  }

  async count(): Promise<number> {
    return UserModel.countDocuments().exec();
  }

  async create(data: Partial<IUser>): Promise<IUser> {
    const user = new UserModel(data);
    return user.save();
  }

  async update(id: string, data: Partial<IUser>): Promise<IUser | null> {
    return UserModel.findByIdAndUpdate(id, data, { returnDocument: 'after' }).exec();
  }

  async delete(id: string): Promise<IUser | null> {
    return UserModel.findByIdAndDelete(id).exec();
  }

  async findAll(): Promise<IUser[]> {
    return UserModel.find().exec();
  }

  async findByIsSystem(): Promise<IUser | null> {
    return UserModel.findOne({ isSystem: true }).exec();
  }
}
