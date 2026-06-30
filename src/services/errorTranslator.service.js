import { getAiClient } from './aiClient.service.js';
import { prisma } from '../config/db.js';

/**
  Diccionario local para traducción y sugerencias rápidas (fallback)
 */
const getFallbackTranslation = (error, sqlQuery) => {
  const code = error.code || '';
  const message = error.message || '';
  
  let mensaje = "Ocurrió un error al procesar tu consulta SQL.";
  let sugerencia = "Revisa la sintaxis e intenta de nuevo. Puedes consultar el diccionario de entidades para validar nombres.";
  let conceptoSQL = "General";

  if (code === 'ER_PARSE_ERROR' || message.toLowerCase().includes('syntax')) {
    mensaje = "Tienes un error de sintaxis en tu consulta SQL.";
    sugerencia = "Revisa que las palabras clave (SELECT, FROM, JOIN, ON, WHERE) estén bien escritas y en el orden correcto.";
    conceptoSQL = "Sintaxis";
    
    // Sugerencia específica para JOIN sin ON
    if (sqlQuery.toUpperCase().includes('JOIN') && !sqlQuery.toUpperCase().includes('ON')) {
      sugerencia = "Parece que estás usando un JOIN pero olvidaste la cláusula 'ON' para especificar la relación entre las tablas.";
    }
  } else if (code === 'ER_BAD_FIELD_ERROR' || message.toLowerCase().includes('unknown column')) {
    const match = message.match(/Unknown column '(.+?)'/i);
    const colName = match ? match[1] : '';
    mensaje = `La columna ${colName ? `'${colName}' ` : ''}no existe en las tablas seleccionadas.`;
    sugerencia = "Verifica que el nombre de la columna esté bien escrito en el SELECT, WHERE o JOIN usando el diccionario de entidades.";
    conceptoSQL = "Diccionario - Columna";
  } else if (code === 'ER_NO_SUCH_TABLE' || message.toLowerCase().includes('doesn\'t exist')) {
    const match = message.match(/Table '(.+?)' doesn't exist/i);
    const tableName = match ? match[1].split('.').pop() : '';
    mensaje = `La tabla ${tableName ? `'${tableName}' ` : ''}no existe en la base de datos.`;
    sugerencia = "Revisa que el nombre de la tabla en la cláusula FROM o JOIN esté bien escrito y exista en el diccionario de entidades.";
    conceptoSQL = "Diccionario - Tabla";
  } else if (code === 'ER_NON_UNIQ_ERROR' || message.toLowerCase().includes('ambiguous')) {
    mensaje = "Una columna es ambigua porque existe en varias tablas de tu JOIN.";
    sugerencia = "Especifica a qué tabla pertenece la columna usando la nomenclatura 'tabla.columna' (por ejemplo: 'citas.id' o 'medicos.nombre').";
  } else if (code === 'ER_ROW_IS_REFERENCED_2' || message.toLowerCase().includes('foreign key constraint fails') || message.toLowerCase().includes('a foreign key constraint fails')) {
    mensaje = "No puedes eliminar o actualizar este registro porque está siendo utilizado (referenciado) por otra tabla.";
    sugerencia = "Concepto de Llave Foránea: Este registro tiene datos asociados en otra tabla (por ejemplo, pedidos, citas, etc.). Primero debes revisar las otras tablas para encontrar y entender qué registros dependen de él, o elegir eliminar un registro que no tenga dependencias. ¡Puedes usar SELECT para explorar los datos!";
  } else if (code === 'ER_NO_REFERENCED_ROW_2' || (message.toLowerCase().includes('foreign key constraint fails') && message.toLowerCase().includes('insert'))) {
    mensaje = "Estás intentando guardar un registro que hace referencia a un ID que no existe en otra tabla.";
    sugerencia = "Concepto de Llave Foránea: Estás asignando una categoría, cliente o relación que no existe. Usa SELECT en la tabla original para ver qué IDs sí están disponibles antes de hacer tu INSERT.";
  } else if (code === 'ER_DUP_ENTRY' || message.toLowerCase().includes('duplicate entry')) {
    mensaje = "Estás intentando insertar un registro con un identificador (Llave Primaria) que ya existe.";
    sugerencia = "Cada registro debe tener un ID único. Revisa qué IDs ya están ocupados en la tabla o cambia tu ID por uno diferente para que no choque con los existentes.";
  } else if (code === 'ER_DATA_TOO_LONG' || message.toLowerCase().includes('data too long')) {
    mensaje = "El texto o valor que intentas guardar es demasiado largo para la columna.";
    sugerencia = "Revisa el diccionario de entidades para ver la longitud máxima permitida (ej. VARCHAR(50)) y acorta tu texto para que encaje.";
  } else if (code === 'ER_BAD_NULL_ERROR' || message.toLowerCase().includes('cannot be null')) {
    const match = message.match(/Column '(.+?)' cannot be null/i);
    const colName = match ? match[1] : 'una columna';
    mensaje = `Intentaste dejar vacía la columna ${colName ? `'${colName}'` : ''}, pero es obligatoria.`;
    sugerencia = "Esta columna no acepta valores nulos. Asegúrate de incluirla en tu INSERT o UPDATE y proporcionarle un valor válido.";
  }

  return { mensaje, sugerencia, conceptoSQL };
};

/**
 * Traduce un error usando la IA (Gemini) con un fallback local si hay timeout
 */
export const translateSqlError = async (error, sqlQuery, userId, practiceId) => {
  const originalMessage = error.message || String(error);
  const fallback = getFallbackTranslation(error, sqlQuery);

  const ai = getAiClient();
  if (!ai) {
    return { ...fallback, isAiGenerated: false };
  }

  const prompt = `
Eres Lumi, un asistente pedagógico de base de datos SQL.
Un estudiante escribió la siguiente consulta SQL:
\`\`\`sql
${sqlQuery}
\`\`\`

Esta consulta falló en la base de datos MySQL con el siguiente error original en inglés:
"${originalMessage}"

Tu tarea es:
1. Traducir y explicar el error de forma DIRECTA, clara y amigable en español. Sé empático pero MUY CONCISO (máximo 2 oraciones breves). Evita introducciones largas o de relleno (como "¡Hola! No te preocupes, a todos nos pasa..."). Ve directo al grano. NO uses emojis.
2. Identificar el problema exacto en la consulta del estudiante y proporcionarle una sugerencia corta, directa y práctica en español sobre cómo solucionarlo (por ejemplo: sugerir corregir un JOIN, una columna mal escrita, etc.). NO uses emojis.
3. Si el error involucra conceptos fundamentales (como Llaves Foráneas, duplicidad de Llave Primaria, o tipos de datos), explica el concepto brevemente y anímalos a usar "SELECT" para explorar las tablas y entender qué datos están causando el conflicto.
4. MUY IMPORTANTE: NUNCA sugieras usar comandos como "SHOW TABLES" o "DESCRIBE". Si el estudiante escribió mal el nombre de una tabla o columna, recuérdale que puede consultar el "Diccionario de Entidades" que se encuentra a un lado en su pantalla para ver la estructura correcta.
5. Identifica el concepto SQL principal que causó el error (ej. "JOIN", "WHERE", "GROUP BY", "SELECT", "INSERT", "Sintaxis General", "Diccionario").

Devuelve tu respuesta únicamente en el siguiente formato JSON, sin comillas Markdown de bloque de código \`\`\`json:
{
  "mensaje": "Explicación breve y directa del error en español (máximo 2 oraciones)...",
  "sugerencia": "Sugerencia corta y directa para solucionarlo...",
  "conceptoSQL": "Concepto SQL principal (ej. JOIN)..."
}
`;

  try {
    // Definimos una promesa de timeout de 15 segundos
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de la API de IA')), 15000)
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
    const finalResult = {
      mensaje: result.mensaje || fallback.mensaje,
      sugerencia: result.sugerencia || fallback.sugerencia,
      conceptoSQL: result.conceptoSQL || fallback.conceptoSQL,
      isAiGenerated: true
    };

    if (userId && practiceId) {
      try {
        await prisma.practiceErrorLog.create({
          data: {
            userId,
            practiceId,
            errorCategory: "Error IA", // Simplificado para este ejemplo
            sqlConcept: finalResult.conceptoSQL,
            originalMessage: originalMessage
          }
        });
      } catch (dbErr) {
        console.error("Error al guardar PracticeErrorLog:", dbErr);
      }
    }
    
    return finalResult;

  } catch (err) {
    console.warn("⚠️ Error en traducción por IA (o timeout). Usando diccionario local de fallback:", err.message);
    const finalFallback = { ...fallback, isAiGenerated: false };
    
    if (userId && practiceId) {
      try {
        await prisma.practiceErrorLog.create({
          data: {
            userId,
            practiceId,
            errorCategory: "Error Local",
            sqlConcept: finalFallback.conceptoSQL,
            originalMessage: originalMessage
          }
        });
      } catch (dbErr) {
        console.error("Error al guardar PracticeErrorLog fallback:", dbErr);
      }
    }
    
    return finalFallback;
  }
};
