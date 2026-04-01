import { UserModel, IUser } from '../models/user.model';

export class UserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email }).exec();
  }

  async findById(id: string): Promise<IUser | null> {
    return UserModel.findById(id).exec();
  }

  async create(data: any): Promise<IUser> {
    const user = new UserModel(data);
    return user.save();
  }
}
