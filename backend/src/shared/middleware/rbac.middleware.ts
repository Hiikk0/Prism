import { FastifyRequest, FastifyReply } from 'fastify';

export const rbacMiddleware = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    if (!user || !user.role || !allowedRoles.includes(user.role)) {
      const error: any = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }
  };
};
