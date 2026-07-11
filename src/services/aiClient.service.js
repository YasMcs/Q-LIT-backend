import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

// Recuperamos todas las llaves (separadas por coma) de la variable GEMINI_API_KEYS
// Si por alguna razón sigue usando la antigua GEMINI_API_KEY, también la soportamos.
const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';

const apiKeys = rawKeys
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

// Inicializamos un arreglo de clientes de Gemini, uno por cada llave
const aiClients = apiKeys.map(key => new GoogleGenAI({ apiKey: key }));
let currentIndex = 0;

/**
 * Retorna el siguiente cliente de Gemini en el arreglo para realizar el balanceo de carga (Round Robin)
 * Si no hay llaves configuradas, retorna null o lanza un error.
 */
export const getAiClient = () => {
  if (aiClients.length === 0) {
    return null; // O throw new Error('No hay API Keys configuradas');
  }
  
  const client = aiClients[currentIndex];
  
  // Imprimimos un log opcional para ver cómo rota (sólo para depuración)
  // console.log(`[Load Balancer] Usando llave #${currentIndex + 1} de ${aiClients.length}`);
  
  // Avanzamos el índice, y si llegamos al final, volvemos a cero (módulo)
  currentIndex = (currentIndex + 1) % aiClients.length;
  
  return client;
};

export const getAiClientsCount = () => aiClients.length;

export const getPrefixForClient = (client) => {
  const index = aiClients.indexOf(client);
  if (index !== -1 && apiKeys[index]) {
    const key = apiKeys[index];
    const start = key.substring(0, 6);
    const end = key.length > 4 ? key.substring(key.length - 4) : '';
    return `#${index + 1} (${start}...${end})`;
  }
  return 'Desconocido';
};
