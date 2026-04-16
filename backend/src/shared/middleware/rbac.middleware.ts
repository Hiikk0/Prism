import { FastifyRequest } from 'fastify';

export const rbacMiddleware = (allowedRoles: string[]) => {
  return async (request: FastifyRequest) => {
    const user = request.user;
    
    if (!user || !user.role || !allowedRoles.includes(user.role)) {
      const error = new Error('Forbidden');
      Object.assign(error, { statusCode: 403 });
      throw error;
    }
  };
};
