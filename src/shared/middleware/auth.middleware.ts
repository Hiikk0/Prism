import { FastifyRequest, FastifyReply } from 'fastify';

export const authMiddleware = (secret: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.cookies.token;
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized: No token provided' });
      }
      
      await request.jwtVerify();
    } catch (err: any) {
      return reply.status(401).send({ error: 'Unauthorized: Invalid token' });
    }
  };
};
