import { executeMockQuery } from '../services/sandbox.service.js';
import { prisma } from '../config/db.js';
import { translateSqlError } from '../services/errorTranslator.service.js';

export const executePracticeQuery = async (req, res, next) => {
  const { practiceId } = req.params;
  const { sqlQuery, activeDb } = req.body;

  try {

    const userId = req.user.id;

    if (!sqlQuery || !sqlQuery.trim()) {
      return res.status(400).json({ error: { message: "La consulta SQL no puede estar vacía." } });
    }

    // Buscar submission del alumno para obtener el setupSql
    const submission = await prisma.submission.findUnique({
      where: {
        userId_practiceId: {
          userId,
          practiceId
        }
      }
    });

    // Call the sandbox simulator
    const result = await executeMockQuery(sqlQuery, activeDb || "punto_venta_db", submission?.setupSql);

    return res.status(200).json({
      status: "success",
      data: result
    });
  } catch (error) {
    // Traducir el error SQL al español y obtener sugerencia
    const translation = await translateSqlError(error, sqlQuery);
    
    // Combinamos el mensaje y la sugerencia en una sola cadena con saltos de línea
    // para que funcione de forma inmediata con el código actual del frontend.
    const combinedMessage = `${translation.mensaje}\n\n💡 Sugerencia: ${translation.sugerencia}`;

    return res.status(400).json({
      status: "error",
      error: { 
        message: combinedMessage,
        mensaje: translation.mensaje,
        suggestion: translation.sugerencia,
        rawMessage: error.message 
      }
    });
  }
};
