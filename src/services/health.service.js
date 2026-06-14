export const checkHealth = () => {
  // Lógica de negocio pura. En el futuro aquí iría la validación de negocio.
  return {
    status: 'OK',
    message: 'Servicio de Q-LIT funcionando correctamente',
    timestamp: new Date().toISOString()
  };
};
