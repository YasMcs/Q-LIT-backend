export const errorHandler = (err, req, res, next) => {
  console.error(err.stack); // Log en servidor para debugging

  // Formato estandarizado de error
  const statusCode = err.statusCode || 500;
  let userMessage = err.message || 'Ocurrió un error inesperado en el servidor';
  
  // Interceptar errores de conexión de la base de datos para mostrar un mensaje amigable
  if (typeof userMessage === 'string' && (userMessage.includes("Can't reach database server") || userMessage.includes("P1001") || userMessage.includes("prisma"))) {
    userMessage = "Hay una intermitencia de red temporal. Por favor, espera unos segundos y refresca la página o vuelve a intentar tu acción.";
  }

  const errorResponse = {
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: userMessage,
    details: err.details || null
  };

  res.status(statusCode).json({ error: errorResponse });
};
