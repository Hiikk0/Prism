import { FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from '../services/user.service';

export class UserController {
  constructor(private userService: UserService) {}

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const body = request.body as any;

    try {
      const updatedUser = await this.userService.updateProfile(user.id, body);
      return reply.send(updatedUser);
    } catch (err: any) {
      if (err.message === 'Username already exists') {
        return reply.status(409).send({ error: err.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
}
