import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/user.repository';

export class AuthService {
  constructor(private userRepository: UserRepository, private jwtSecret: string) {}

  async register(data: any): Promise<any> {
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const savedUser = await this.userRepository.create({
      email: data.email,
      passwordHash,
      role: data.role || 'user',
    });

    const token = this.generateToken(savedUser);
    
    // Explicitly exclude passwordHash from the response
    const userObj = savedUser.toObject();
    const { passwordHash: _, ...userWithoutPassword } = userObj;
    
    return { user: userWithoutPassword, token };
  }

  async login(email: string, password: string): Promise<any> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken(user);
    
    const userObj = user.toObject();
    const { passwordHash: _, ...userWithoutPassword } = userObj;
    
    return { user: userWithoutPassword, token };
  }

  private generateToken(user: any): string {
    return jwt.sign(
      { id: user._id, email: user.email, role: user.role }, 
      this.jwtSecret, 
      { expiresIn: '1d' }
    );
  }
}
