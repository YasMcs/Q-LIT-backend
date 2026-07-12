import { Type } from '@google/genai';
import { getAiClient, getAiClientsCount, getPrefixForClient } from './aiClient.service.js';
import OpenAI from 'openai';

// Transforma esquemas de Gemini a formato estándar compatible con Structured Outputs de OpenAI
const convertSchema = (schema) => {
  if (!schema) return undefined;
  
  const result = {};
  
  // Mapear tipos de datos
  if (schema.type === Type.OBJECT || schema.type === 'OBJECT') {
    result.type = 'object';
  } else if (schema.type === Type.STRING || schema.type === 'STRING') {
    result.type = 'string';
  } else if (schema.type === Type.ARRAY || schema.type === 'ARRAY') {
    result.type = 'array';
  } else if (schema.type === Type.BOOLEAN || schema.type === 'BOOLEAN') {
    result.type = 'boolean';
  } else if (schema.type === Type.INTEGER || schema.type === 'INTEGER') {
    result.type = 'integer';
  } else {
    result.type = schema.type;
  }

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.properties) {
    result.properties = {};
    for (const key in schema.properties) {
      result.properties[key] = convertSchema(schema.properties[key]);
    }
  }

  if (schema.required) {
    result.required = schema.required;
  }

  if (schema.items) {
    result.items = convertSchema(schema.items);
  }

  // Structured Outputs requiere additionalProperties: false en objetos y que todos los campos sean requeridos
  if (result.type === 'object') {
    result.additionalProperties = false;
    if (!result.required) {
      result.required = Object.keys(result.properties || {});
    }
  }

  return result;
};

/**
 * Realiza la generación de contenido mediante la API de Gemini o de OpenAI si está configurada.
 */
export const generateContentWithRetry = async (modelParams) => {
  // 1. Si hay una llave de OpenAI configurada localmente, procesamos por OpenAI
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    try {
      console.log(`[OpenAI API] Usando gpt-4o-mini para procesar la petición localmente...`);
      
      const messages = [{ role: 'user', content: modelParams.contents }];
      
      let responseFormat;
      if (modelParams.config?.responseMimeType === 'application/json') {
        if (modelParams.config.responseSchema) {
          const jsonSchema = convertSchema(modelParams.config.responseSchema);
          responseFormat = {
            type: 'json_schema',
            json_schema: {
              name: 'structured_response',
              strict: true,
              schema: jsonSchema
            }
          };
        } else {
          responseFormat = { type: 'json_object' };
        }
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        response_format: responseFormat,
      });

      const responseText = completion.choices[0].message.content;
      return { text: responseText };
    } catch (error) {
      console.error("[OpenAI API] Error detectado localmente:", error);
      throw error;
    }
  }

  // 2. Si no hay llave de OpenAI, ejecutamos la rotación de Gemini habitual
  const maxAttempts = Math.max(getAiClientsCount(), 1);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ai = getAiClient();
    if (!ai) {
      throw new Error('No hay API Keys de Gemini configuradas en el servidor');
    }

    const keyPrefix = getPrefixForClient(ai);

    try {
      const response = await ai.models.generateContent(modelParams);
      return response;
    } catch (error) {
      lastError = error;
      const errorMsg = error.toString() || '';
      const errorBody = error.message || '';
      
      const isRetryableError = 
        error.status === 429 || 
        error.status === 403 || 
        error.status === 401 ||
        error.statusCode === 429 ||
        error.statusCode === 403 ||
        error.statusCode === 401 ||
        errorMsg.includes('429') ||
        errorMsg.includes('403') ||
        errorMsg.includes('401') ||
        errorMsg.includes('quota') ||
        errorMsg.includes('RESOURCE_EXHAUSTED') ||
        errorMsg.includes('PERMISSION_DENIED') ||
        errorBody.includes('429') ||
        errorBody.includes('403') ||
        errorBody.includes('401') ||
        errorBody.includes('quota') ||
        errorBody.includes('RESOURCE_EXHAUSTED') ||
        errorBody.includes('PERMISSION_DENIED');

      if (isRetryableError && attempt < maxAttempts) {
        console.warn(`[Gemini API] Llave '${keyPrefix}' falló (error: ${error.status || 'API Error'}). Reintentando con la siguiente llave (Intento ${attempt}/${maxAttempts})...`);
        continue;
      }

      throw error;
    }
  }
  throw lastError;
};
/**
 * Evalúa el código SQL de un alumno contra una lista de cotejo.
 * @param {string} studentSqlCode - El código SQL escrito por el alumno
 * @param {string} practiceObjective - El objetivo general de la práctica
 * @param {Array} checklist - Array de objetos con { id, criterio, maxPoints }
 * @returns {Object} JSON con las calificaciones booleanas y la retroalimentación
 */
export const evaluateSqlSubmission = async (studentSqlCode, practiceObjective, checklist) => {
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
3. Sé flexible al evaluar: acepta lógicas o soluciones alternativas que resuelvan el objetivo de manera válida, siempre y cuando cumplan con el objetivo general y no violen explícitamente las cláusulas de la lista de cotejo.
4. Escribe una breve retroalimentación general. Sin emojis.
`;

  try {
    // 3. Llamamos a Gemini usando reintento y rotación
    const response = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
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
    const response1 = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
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

    const response2 = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
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

