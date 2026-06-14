import * as aiService from '../services/ai.service.js';

export const evaluateSubmission = async (req, res, next) => {
  try {
    const { studentSqlCode, practiceObjective, checklist } = req.body;

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

    // En el futuro, aquí el Repositorio guardaría la calificación en la Base de Datos.
    // await submissionRepository.saveEvaluation(evaluationResult);

    // Devolvemos el JSON de la IA directo al cliente
    res.status(200).json({
      message: "Evaluación completada con éxito",
      data: evaluationResult
    });

  } catch (error) {
    next(error); // Pasa el error al manejador global
  }
};
