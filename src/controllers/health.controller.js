import * as healthService from '../services/health.service.js';

export const getHealth = (req, res, next) => {
  try {
    // El controller recibe la petición (req) e invoca al servicio
    const data = healthService.checkHealth();
    
    // Devuelve el Status Code correcto (200 OK)
    res.status(200).json(data);
  } catch (error) {
    // Si hay error, se lo pasamos al Middleware global
    next(error);
  }
};
