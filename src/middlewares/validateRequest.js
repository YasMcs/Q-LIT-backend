import { ZodError } from 'zod';

export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body); // Sobrescribe el body con los datos parseados y limpiados
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Datos de petición inválidos',
            details: errorMessages
          }
        });
      }
      next(error);
    }
  };
};
