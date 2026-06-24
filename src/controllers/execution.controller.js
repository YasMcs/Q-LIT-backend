import { executeMockQuery } from '../services/sandbox.service.js';
import { prisma } from '../config/db.js';

export const executePracticeQuery = async (req, res, next) => {
  try {
    const { practiceId } = req.params;
    const { sqlQuery, activeDb } = req.body;

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
    // Return formatted error for frontend terminal
    return res.status(400).json({
      status: "error",
      error: { message: error.message }
    });
  }
};
