import { Type } from '@google/genai';
import { getAiClient } from './aiClient.service.js';

// Ya no inicializamos el cliente estático aquí, lo llamamos en cada petición
/**
 * Evalúa el código SQL de un alumno contra una lista de cotejo.
 * @param {string} studentSqlCode - El código SQL escrito por el alumno
 * @param {string} practiceObjective - El objetivo general de la práctica
 * @param {Array} checklist - Array de objetos con { id, criterio, maxPoints }
 * @returns {Object} JSON con las calificaciones booleanas y la retroalimentación
 */
export const evaluateSqlSubmission = async (studentSqlCode, practiceObjective, checklist) => {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('No hay API Keys de Gemini configuradas en el servidor');
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

export const evaluateStep = async (studentSqlCode, stepInstruction) => {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('No hay API Keys de Gemini configuradas');
  }

  // FASE 1: Verificación estricta del objetivo (SÓLO Boolean)
  const validationSchema = {
    type: Type.OBJECT,
    properties: {
      isCorrect: {
        type: Type.BOOLEAN,
        description: "true si el código SQL permite alcanzar el objetivo planteado, false si no."
      }
    },
    required: ["isCorrect"]
  };

  const validationPrompt = `
Eres un evaluador automático de código SQL.
OBJETIVO: ${stepInstruction}
CÓDIGO DEL ALUMNO:
\`\`\`sql
${studentSqlCode}
\`\`\`
Determina si la consulta cumple la instrucción (SÉ FLEXIBLE: aprueba lógicas alternativas que sean válidas). Responde solo true o false.`;

  try {
    const response1 = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: validationPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: validationSchema,
        }
    });

    const result = JSON.parse(response1.text);
    
    // Si es correcto, terminamos aquí y ahorramos tokens
    if (result.isCorrect) {
        return { isCorrect: true, feedback: "" };
    }

    // FASE 2: Generación de retroalimentación (Sólo si falló)
    const feedbackSchema = {
      type: Type.OBJECT,
      properties: {
        feedback: {
          type: Type.STRING,
          description: "Mensaje educativo explicando en qué falló o cómo corregirlo sin dar la respuesta."
        }
      },
      required: ["feedback"]
    };

    const feedbackPrompt = `
Un estudiante intentó resolver este objetivo SQL: "${stepInstruction}"
Escribió este código: 
\`\`\`sql
${studentSqlCode}
\`\`\`
El código NO cumple el objetivo. Escribe una breve retroalimentación (máx 3 oraciones) guiándolo sin darle la respuesta directa. Sin emojis.`;

    const response2 = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: feedbackPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: feedbackSchema,
        }
    });

    const feedbackResult = JSON.parse(response2.text);
    return { isCorrect: false, feedback: feedbackResult.feedback };

  } catch (error) {
    console.error("Error en evaluateStep (Fases 1/2):", error);
    throw new Error("Fallo en el servicio de Inteligencia Artificial");
  }
};

