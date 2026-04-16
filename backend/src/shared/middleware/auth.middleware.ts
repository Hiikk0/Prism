import { FastifyRequest } from 'fastify';

export const authMiddleware = () => {
  return async (request: FastifyRequest) => {
    try {
      const token = request.cookies.token;
      if (!token) {
        const error = new Error('Unauthorized');
        Object.assign(error, { statusCode: 401 });
        throw error;
      }
      
      await request.jwtVerify();
    } catch {
      const error = new Error('Unauthorized');
      Object.assign(error, { statusCode: 401 });
      throw error;
    }
  };
};
