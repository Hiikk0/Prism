import { FastifyRequest, FastifyReply } from 'fastify';
import { validate } from '../../../shared/utils/validate';
import { UpdateProfileSchema } from '../schemas/auth.schema';
import { UserService } from '../services/user.service';
import { getErrorMessage } from '../../../shared/utils/error.util';

export class UserController {
  constructor(private userService: UserService) {}

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    const body = validate(UpdateProfileSchema, request.body);

    try {
      const updatedUser = await this.userService.updateProfile(user.id, body);
      return reply.send({ user: updatedUser });
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message === 'Username already exists') {
        return reply.status(409).send({ error: message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
}
