import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

// Inicializamos el cliente de Gemini
// Usa la clave desde process.env.GEMINI_API_KEY
const ai = new GoogleGenAI({}); 

/**
 * Evalúa el código SQL de un alumno contra una lista de cotejo.
 * @param {string} studentSqlCode - El código SQL escrito por el alumno
 * @param {string} practiceObjective - El objetivo general de la práctica
 * @param {Array} checklist - Array de objetos con { id, criterio, maxPoints }
 * @returns {Object} JSON con las calificaciones booleanas y la retroalimentación
 */
export const evaluateSqlSubmission = async (studentSqlCode, practiceObjective, checklist) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor');
  }

  // 1. Armamos el esquema estructurado que queremos que Gemini nos devuelva
  // Queremos que devuelva un JSON exacto, forzado por la API
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      evaluations: {
        type: Type.ARRAY,
        description: "Lista de evaluaciones para cada criterio de la lista de cotejo",
        items: {
          type: Type.OBJECT,
          properties: {
            checklistItemId: {
              type: Type.STRING,
              description: "El ID del criterio evaluado"
            },
            aiComplies: {
              type: Type.BOOLEAN,
              description: "true si el código SQL del alumno cumple con este criterio, false si no"
            }
          },
          required: ["checklistItemId", "aiComplies"]
        }
      },
      feedback: {
        type: Type.STRING,
        description: "Un mensaje amigable y educativo dirigido al alumno explicando en qué falló o felicitándolo si todo está perfecto. Máximo 3 oraciones. NO utilices emojis en tu respuesta."
      }
    },
    required: ["evaluations", "feedback"]
  };

  // 2. Construimos el Prompt Maestro
  const prompt = `
Eres Q-LIT, un profesor experto en Bases de Datos SQL, muy estricto pero pedagógico.
Tu tarea es evaluar la consulta SQL de un alumno.

OBJETIVO DE LA PRÁCTICA:
${practiceObjective}

CÓDIGO SQL DEL ALUMNO:
\`\`\`sql
${studentSqlCode}
\`\`\`

LISTA DE COTEJO (CRITERIOS A EVALUAR):
${JSON.stringify(checklist, null, 2)}

INSTRUCCIONES:
1. Revisa detenidamente el código SQL del alumno.
2. Para cada criterio en la lista de cotejo, determina si el código del alumno lo cumple de manera impecable (true o false).
3. Escribe una breve retroalimentación general.
`;

  try {
    // 3. Llamamos a Gemini (Podemos usar gemini-2.5-flash para rapidez)
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        }
    });

    // 4. Gemini devuelve un String en formato JSON, lo parseamos
    const resultJson = JSON.parse(response.text);
    return resultJson;
    
  } catch (error) {
    console.error("Error al comunicarse con Gemini AI:", error);
    throw new Error("Fallo en el servicio de Inteligencia Artificial");
  }
};
