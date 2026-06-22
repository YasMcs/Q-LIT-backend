import * as aiService from '../services/ai.service.js';
import { prisma } from '../config/db.js';

export const evaluateSubmission = async (req, res, next) => {
  try {
    const { studentSqlCode, practiceObjective, checklist, submissionId, practiceId } = req.body;
    const userId = req.user?.id;

    // Validación básica
    if (!studentSqlCode || !practiceObjective || !checklist) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Faltan parámetros requeridos: studentSqlCode, practiceObjective, checklist'
        }
      });
    }

    // Llamamos al servicio de Inteligencia Artificial
    const evaluationResult = await aiService.evaluateSqlSubmission(
      studentSqlCode,
      practiceObjective,
      checklist
    );

    // Intentar buscar la submission si se proporciona submissionId o practiceId + userId
    let submission = null;
    if (submissionId) {
      submission = await prisma.submission.findUnique({
        where: { id: submissionId }
      });
    } else if (practiceId && userId) {
      submission = await prisma.submission.findUnique({
        where: {
          userId_practiceId: {
            userId,
            practiceId
          }
        }
      });
    }

    if (submission) {
      // 1. Actualizar el código SQL, estado de revisión y fecha de entrega
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          studentSqlCode,
          reviewStatus: "calificada",
          submittedAt: new Date()
        }
      });

      // 2. Guardar los resultados detallados de la lista de cotejo
      if (evaluationResult.evaluations && Array.isArray(evaluationResult.evaluations)) {
        for (const ev of evaluationResult.evaluations) {
          // El checklistItemId de la IA debe coincidir con uno del checklist original para guardarlo
          const originalItem = checklist.find(c => c.id === ev.checklistItemId);
          if (originalItem) {
            await prisma.checklistEvaluation.upsert({
              where: {
                submissionId_checklistItemId: {
                  submissionId: submission.id,
                  checklistItemId: ev.checklistItemId
                }
              },
              update: {
                aiComplies: ev.aiComplies
              },
              create: {
                submissionId: submission.id,
                checklistItemId: ev.checklistItemId,
                aiComplies: ev.aiComplies
              }
            });
          }
        }
      }
    }

    // Mapear los resultados al formato esperado por el frontend
    let score = 0;
    const checklistResults = (evaluationResult.evaluations || []).map(ev => {
      const originalItem = checklist.find(c => c.id === ev.checklistItemId);
      const maxPoints = originalItem ? originalItem.maxPoints : 0;
      const criterion = originalItem ? (originalItem.criterion || originalItem.text || "") : "";
      const earnedPoints = ev.aiComplies ? maxPoints : 0;
      score += earnedPoints;

      return {
        checklistItemId: ev.checklistItemId,
        criterion,
        earnedPoints,
        maxPoints,
        comment: ev.aiComplies ? "Implementado correctamente" : "No cumple con el criterio"
      };
    });

    // Devolvemos el JSON estructurado al cliente
    res.status(200).json({
      message: "Evaluación completada con éxito",
      data: {
        score,
        feedback: evaluationResult.feedback,
        checklistResults
      }
    });

  } catch (error) {
    next(error); // Pasa el error al manejador global
  }
};
