import { executeMockQuery } from '../services/sandbox.service.js';
import { prisma } from '../config/db.js';
import { translateSqlError } from '../services/errorTranslator.service.js';

export const executePracticeQuery = async (req, res, next) => {
  const { practiceId } = req.params;
  const { sqlQuery, activeDb } = req.body;

  let userId = null;
  try {
    userId = req.user?.id;

    if (!sqlQuery || !sqlQuery.trim()) {
      return res.status(400).json({ error: { message: "La consulta SQL no puede estar vacía." } });
    }

    // Buscar la práctica para saber a qué aula pertenece
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId }
    });
    if (!practice) {
      return res.status(404).json({ error: { message: "Práctica no encontrada." } });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_classroomId: {
          userId,
          classroomId: practice.classroomId
        }
      }
    });

    if (!enrollment || enrollment.isArchived) {
      return res.status(403).json({ error: { message: "No puedes ejecutar consultas de una práctica de un laboratorio del cual te has salido." } });
    }

    // Buscar submission del alumno para obtener el setupSql y el historial acumulativo
    const submission = await prisma.submission.findUnique({
      where: {
        userId_practiceId: {
          userId,
          practiceId
        }
      },
      include: {
        steps: {
          where: { completed: true },
          orderBy: { stepIndex: 'asc' },
          select: { finalSqlCode: true }
        }
      }
    });

    // Extraer el array de sentencias SQL previamente superadas por el alumno
    const completedQueries = submission?.steps
      ? submission.steps.map(step => step.finalSqlCode).filter(sql => sql && sql.trim() !== '')
      : [];

    // Call the sandbox simulator (inyectando setupSql y las sentencias previas)
    const result = await executeMockQuery(sqlQuery, activeDb || "punto_venta_db", submission?.setupSql, completedQueries);

    return res.status(200).json({
      status: "success",
      data: result
    });
  } catch (error) {
    // Traducir el error SQL al español, obtener sugerencia y registrar el error
    const translation = await translateSqlError(error, sqlQuery, userId, practiceId);
    
    // Combinamos el mensaje y la sugerencia en una sola cadena con saltos de línea
    // para que funcione de forma inmediata con el código actual del frontend.
    const combinedMessage = `${translation.mensaje}\n\nSugerencia: ${translation.sugerencia}`;

    return res.status(400).json({
      status: "error",
      error: { 
        message: combinedMessage,
        mensaje: translation.mensaje,
        suggestion: translation.sugerencia,
        isAiGenerated: translation.isAiGenerated,
        rawMessage: error.message 
      }
    });
  }
};
