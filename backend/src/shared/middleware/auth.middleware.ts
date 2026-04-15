import { FastifyRequest, FastifyReply } from 'fastify';

export const authMiddleware = (secret: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.cookies.token;
      if (!token) {
        const error: any = new Error('Unauthorized');
        error.statusCode = 401;
        throw error;
      }
      
      await request.jwtVerify();
    } catch (err: any) {
      const error: any = new Error('Unauthorized');
      error.statusCode = 401;
      throw error;
    }
  };
};
