export const errorHandler = (err, req, res, next) => {
  console.error(err.stack); // Log en servidor para debugging

  // Formato estandarizado de error
  const statusCode = err.statusCode || 500;
  const errorResponse = {
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'Ocurrió un error inesperado en el servidor',
    details: err.details || null
  };

  res.status(statusCode).json({ error: errorResponse });
};
