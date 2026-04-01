import { FastifyRequest, FastifyReply } from 'fastify';

export const rbacMiddleware = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      
      if (!user || !user.role) {
        return reply.status(403).send({ error: 'Forbidden: Unknown role' });
      }

      const hasRole = allowedRoles.includes(user.role);
      
      if (!hasRole) {
        return reply.status(403).send({ error: 'Forbidden: Insufficient permissions' });
      }
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error during authorization' });
    }
  };
};
