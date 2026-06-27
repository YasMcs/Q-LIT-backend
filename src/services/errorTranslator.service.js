import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

/**
  Diccionario local para traducción y sugerencias rápidas (fallback)
 */
const getFallbackTranslation = (error, sqlQuery) => {
  const code = error.code || '';
  const message = error.message || '';
  
  let mensaje = "Ocurrió un error al procesar tu consulta SQL.";
  let sugerencia = "Revisa la sintaxis e intenta de nuevo. Puedes consultar el diccionario de entidades para validar nombres.";

  if (code === 'ER_PARSE_ERROR' || message.toLowerCase().includes('syntax')) {
    mensaje = "Tienes un error de sintaxis en tu consulta SQL.";
    sugerencia = "Revisa que las palabras clave (SELECT, FROM, JOIN, ON, WHERE) estén bien escritas y en el orden correcto.";
    
    // Sugerencia específica para JOIN sin ON
    if (sqlQuery.toUpperCase().includes('JOIN') && !sqlQuery.toUpperCase().includes('ON')) {
      sugerencia = "Parece que estás usando un JOIN pero olvidaste la cláusula 'ON' para especificar la relación entre las tablas.";
    }
  } else if (code === 'ER_BAD_FIELD_ERROR' || message.toLowerCase().includes('unknown column')) {
    const match = message.match(/Unknown column '(.+?)'/i);
    const colName = match ? match[1] : '';
    mensaje = `La columna ${colName ? `'${colName}' ` : ''}no existe en las tablas seleccionadas.`;
    sugerencia = "Verifica que el nombre de la columna esté bien escrito en el SELECT, WHERE o JOIN usando el diccionario de entidades.";
  } else if (code === 'ER_NO_SUCH_TABLE' || message.toLowerCase().includes('doesn\'t exist')) {
    const match = message.match(/Table '(.+?)' doesn't exist/i);
    const tableName = match ? match[1].split('.').pop() : '';
    mensaje = `La tabla ${tableName ? `'${tableName}' ` : ''}no existe en la base de datos.`;
    sugerencia = "Revisa que el nombre de la tabla en la cláusula FROM o JOIN esté bien escrito y exista en el diccionario de entidades.";
  } else if (code === 'ER_NON_UNIQ_ERROR' || message.toLowerCase().includes('ambiguous')) {
    mensaje = "Una columna es ambigua porque existe en varias tablas de tu JOIN.";
    sugerencia = "Especifica a qué tabla pertenece la columna usando la nomenclatura 'tabla.columna' (por ejemplo: 'citas.id' o 'medicos.nombre').";
  }

  return { mensaje, sugerencia };
};

/**
 * Traduce un error usando la IA (Gemini) con un fallback local si hay timeout
 */
export const translateSqlError = async (error, sqlQuery) => {
  const originalMessage = error.message || String(error);
  const fallback = getFallbackTranslation(error, sqlQuery);

  if (!ai) {
    return fallback;
  }

  const prompt = `
Eres Q-LIT, un asistente pedagógico de base de datos SQL.
Un estudiante escribió la siguiente consulta SQL:
\`\`\`sql
${sqlQuery}
\`\`\`

Esta consulta falló en la base de datos MySQL con el siguiente error original en inglés:
"${originalMessage}"

Tu tarea es:
1. Traducir y explicar el error de forma clara y amigable en español. Sé empático y pedagógico.
2. Identificar el problema exacto en la consulta del estudiante y proporcionarle una sugerencia corta, directa y práctica en español sobre cómo solucionarlo (por ejemplo: sugerir corregir un JOIN, una columna mal escrita, etc.).

Devuelve tu respuesta únicamente en el siguiente formato JSON, sin comillas Markdown de bloque de código \`\`\`json:
{
  "mensaje": "Explicación clara del error en español...",
  "sugerencia": "Sugerencia corta y directa para solucionarlo..."
}
`;

  try {
    // Definimos una promesa de timeout de 1.5 segundos
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de la API de IA')), 1500)
    );

    // Llamamos a la API de Gemini
    const geminiPromise = (async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      return JSON.parse(response.text.trim());
    })();

    // Ejecutamos ambas en carrera
    const result = await Promise.race([geminiPromise, timeoutPromise]);
    return {
      mensaje: result.mensaje || fallback.mensaje,
      sugerencia: result.sugerencia || fallback.sugerencia
    };

  } catch (err) {
    console.warn("⚠️ Error en traducción por IA (o timeout). Usando diccionario local de fallback:", err.message);
    return fallback;
  }
};
