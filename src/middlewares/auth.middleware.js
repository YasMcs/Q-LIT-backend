export const bffAuthMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const userId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];

  const expectedKey = process.env.API_SECRET_KEY || 'q-lit-internal-bff-secret-12345';

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Acceso denegado. Se requiere una API Key válida del BFF.'
      }
    });
  }

  if (!userId) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Acceso denegado. Se requiere el ID del usuario.'
      }
    });
  }

  // Inyectar la información del usuario en el objeto request para que los controladores la usen
  req.user = {
    id: userId,
    role: userRole
  };

  next();
};
