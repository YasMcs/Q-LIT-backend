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
    const nearMatch = message.match(/near '([^']+)'/i);
    const nearToken = nearMatch ? nearMatch[1] : '';
    mensaje = nearToken 
      ? `Tienes un error de sintaxis en tu consulta SQL cerca de '${nearToken}'.`
      : "Tienes un error de sintaxis en tu consulta SQL.";
    sugerencia = "Revisa que las palabras clave (SELECT, FROM, JOIN, ON, WHERE) estén bien escritas y en el orden correcto.";
    conceptoSQL = "Sintaxis";
    
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
  } else if (code === 'ER_ROW_IS_REFERENCED_2' || (message.toLowerCase().includes('foreign key constraint fails') && (message.toLowerCase().includes('delete') || message.toLowerCase().includes('update')))) {
    mensaje = "No puedes eliminar o actualizar este registro porque está siendo utilizado (referenciado) por otra tabla.";
    sugerencia = "Concepto de Llave Foránea: Este registro tiene datos asociados en otra tabla. Primero debes revisar las otras tablas para encontrar y entender qué registros dependen de él, o elegir eliminar un registro que no tenga dependencias. ¡Puedes usar SELECT para explorar los datos!";
  } else if (code === 'ER_NO_REFERENCED_ROW_2' || message.toLowerCase().includes('foreign key constraint fails')) {
    mensaje = "Estás intentando guardar o actualizar un registro que hace referencia a un ID que no existe en otra tabla.";
    sugerencia = "Concepto de Llave Foránea: Estás asignando una relación (como un doctor, paciente o categoría) que no existe en la tabla principal. Revisa qué IDs están disponibles en esa tabla antes de realizar tu operación.";
  } else if (code === 'ER_DUP_ENTRY' || message.toLowerCase().includes('duplicate entry')) {
    mensaje = "Estás intentando insertar un registro con un identificador (Llave Primaria) que ya existe.";
    sugerencia = "Cada registro debe tener un ID único. Revisa qué IDs ya están ocupados en la tabla o cambia tu ID por uno diferente para que no choque con los existentes.";
  } else if (code === 'ER_DATA_TOO_LONG' || message.toLowerCase().includes('data too long')) {
    mensaje = "El texto o valor que intentas guardar es demasiado largo para la columna.";
    sugerencia = "Revisa el diccionario de entidades para ver la longitud máxima permitida (ej. VARCHAR(50)) y acorta tu texto para que encaje.";
  } else if (code === 'ER_BAD_NULL_ERROR' || message.toLowerCase().includes('cannot be null') || code === 'ER_NO_DEFAULT_FOR_FIELD' || message.toLowerCase().includes('default value')) {
    let colName = 'una columna';
    const matchNull = message.match(/Column '(.+?)' cannot be null/i);
    const matchDefault = message.match(/Field '(.+?)' doesn't have a default value/i);
    if (matchNull) colName = matchNull[1];
    else if (matchDefault) colName = matchDefault[1];
    
    mensaje = `Intentaste dejar vacía la columna ${colName !== 'una columna' ? `'${colName}'` : 'obligatoria'}, o no le proporcionaste un valor válido.`;
    sugerencia = "Esta columna es obligatoria y no acepta valores nulos ni tiene un valor predeterminado. Asegúrate de incluirla en tu INSERT y proporcionarle un valor válido.";
    conceptoSQL = "Obligatoriedad";
  }

  return { mensaje, sugerencia, conceptoSQL };
};

/**
 * Traduce un error usando el diccionario local (fallback) sin usar IA para ahorrar tokens.
 */
export const translateSqlError = async (error, sqlQuery, userId, practiceId) => {
  const originalMessage = error.message || String(error);
  const fallback = getFallbackTranslation(error, sqlQuery);
  const finalFallback = { ...fallback, isAiGenerated: false };

  // Guardamos el error en el log para las estadísticas del docente
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
};
