import { ZodSchema } from 'zod';

/**
 * Validates data against a Zod schema and returns the parsed data.
 * Throws a Fastify-compatible 400 error if validation fails.
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = new Error('Validation Error');
    Object.assign(error, { 
      statusCode: 400, 
      validation: result.error.issues 
    });
    throw error;
  }
  return result.data;
}
