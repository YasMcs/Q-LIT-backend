import * as aiService from '../services/ai.service.js';
import { prisma } from '../config/db.js';
import { sendGradedEmail } from '../services/email.service.js';
import { executeMockQuery } from '../services/sandbox.service.js';

export const evaluateSubmission = async (req, res, next) => {
  try {
    const { studentSqlCode, executionResult: resultData, practiceObjective, checklist, submissionId, practiceId } = req.body;
    const userId = req.user?.id;

    // Llamamos al servicio de Inteligencia Artificial
    let evaluationResult = { evaluations: [], feedback: "La IA no pudo evaluar tu entrega en este momento, pero ha sido enviada con éxito para que tu maestro la califique manualmente." };
    let aiFailed = false;
    try {
      evaluationResult = await aiService.evaluateSqlSubmission(
        studentSqlCode,
        practiceObjective,
        checklist
      );
    } catch (aiError) {
      console.error("[AI Evaluation Error] Evaluacion fallida, guardando como pendiente:", aiError);
      aiFailed = true;
    }

    // Intentar buscar la submission si se proporciona submissionId o practiceId + userId
    let submission = null;
    if (submissionId) {
      submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { practice: true }
      });
    } else if (practiceId && userId) {
      submission = await prisma.submission.findUnique({
        where: {
          userId_practiceId: {
            userId,
            practiceId
          }
        },
        include: { practice: true }
      });
    }

    if (submission) {
      // 0. Verificar si la entrega está bloqueada por fecha límite (closeLateSubmissions)
      const practice = submission.practice;
      if (practice && practice.deadline) {
        const isLate = new Date() > new Date(practice.deadline);
        console.log(`[Submission Check] Practice: "${practice.title}", closeLateSubmissions: ${practice.closeLateSubmissions}, Is Late: ${isLate}`);
        if (practice.closeLateSubmissions && isLate) {
          return res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: 'El periodo de entrega para esta práctica ha finalizado.'
            }
          });
        }
      }
      // 1. Actualizar el código SQL, resultado, estado de revisión y fecha de entrega
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          studentSqlCode,
          executionResult: resultData ? JSON.stringify(resultData) : null,
          reviewStatus: "pendiente",
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

    let score = 0;
    const finalEvaluations = checklist.map(c => {
      const aiEv = evaluationResult.evaluations.find(ev => ev.checklistItemId === c.id);
      if (aiEv && aiEv.aiComplies) {
        score += c.maxPoints;
      }
      return {
        id: c.id,
        criterion: c.criterion || c.text || "",
        maxPoints: c.maxPoints,
        aiComplies: aiEv ? aiEv.aiComplies : null
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        score,
        maxScore: checklist.reduce((sum, c) => sum + c.maxPoints, 0),
        feedback: evaluationResult.feedback,
        aiFailed,
        evaluations: finalEvaluations
      }
    });

  } catch (error) {
    next(error); // Pasa el error al manejador global
  }
};

export const confirmTeacherGrade = async (req, res, next) => {
  try {
    const { submissionId, evaluations } = req.body;

    if (!submissionId || !Array.isArray(evaluations)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Faltan parámetros requeridos: submissionId, evaluations'
        }
      });
    }

    // 1. Actualizar estado de la entrega a "calificada"
    await prisma.submission.update({
      where: { id: submissionId },
      data: { reviewStatus: "calificada" }
    });

    // 2. Actualizar las evaluaciones individuales (teacherComplies)
    for (const ev of evaluations) {
      if (ev.checklistItemId !== undefined && ev.teacherComplies !== undefined) {
        await prisma.checklistEvaluation.updateMany({
          where: {
            submissionId: submissionId,
            checklistItemId: ev.checklistItemId
          },
          data: {
            teacherComplies: ev.teacherComplies
          }
        });
      }
    }

    // 3. Enviar correo al estudiante (en background)
    try {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          user: true,
          practice: {
            include: { checklistItems: true }
          },
          evaluations: true
        }
      });
      
      if (submission && submission.user?.email && submission.practice) {
        // Calcular score final usando teacherComplies
        let totalScore = 0;
        submission.evaluations.forEach(ev => {
          if (ev.teacherComplies) {
            const item = submission.practice.checklistItems.find(i => i.id === ev.checklistItemId);
            if (item) totalScore += item.maxPoints;
          }
        });
        
        sendGradedEmail(
          submission.user.email,
          submission.user.name,
          submission.practice.title,
          totalScore,
          submission.practice.totalPoints
        );
      }
    } catch (emailError) {
      console.error('Error enviando correo de calificación:', emailError);
    }

    res.status(200).json({
      message: "Calificación confirmada con éxito",
      data: { submissionId }
    });

  } catch (error) {
    next(error);
  }
};

export const assignZeroGrade = async (req, res, next) => {
  try {
    const { practiceId, studentId } = req.body;

    if (!practiceId || !studentId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Faltan parámetros requeridos: practiceId, studentId' }
      });
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      include: { checklistItems: true }
    });

    if (!practice) {
      return res.status(404).json({ error: { message: 'Práctica no encontrada' } });
    }

    const submission = await prisma.submission.upsert({
      where: {
        userId_practiceId: { userId: studentId, practiceId: practiceId }
      },
      update: {
        reviewStatus: "calificada",
        studentSqlCode: "-- Asignado 0 por docente",
        executionResult: null
      },
      create: {
        userId: studentId,
        practiceId: practiceId,
        studentSqlCode: "-- Asignado 0 por docente",
        reviewStatus: "calificada"
      }
    });

    for (const item of practice.checklistItems) {
      await prisma.checklistEvaluation.upsert({
        where: {
          submissionId_checklistItemId: { submissionId: submission.id, checklistItemId: item.id }
        },
        update: { aiComplies: false, teacherComplies: false },
        create: { submissionId: submission.id, checklistItemId: item.id, aiComplies: false, teacherComplies: false }
      });
    }

    res.status(200).json({
      message: "Calificación 0 asignada con éxito",
      data: { submissionId: submission.id }
    });
  } catch (error) {
    next(error);
  }
};

export const evaluateStep = async (req, res, next) => {
  try {
    const { submissionId, stepIndex, studentSqlCode, activeDb } = req.body;
    const userId = req.user?.id;

    if (!submissionId || stepIndex === undefined || !studentSqlCode) {
      return res.status(400).json({ error: { message: "Faltan parámetros requeridos" } });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { practice: true }
    });

    if (!submission || submission.userId !== userId) {
      return res.status(404).json({ error: { message: "Submission no encontrada" } });
    }

    // 1. Obtener la instrucción del paso actual
    let steps = [];
    try {
      const parsedStatement = JSON.parse(submission.generatedStatement);
      steps = parsedStatement.pasos || [];
    } catch (e) {
      return res.status(500).json({ error: { message: "Error al parsear el enunciado" } });
    }

    const currentStepObj = steps.find(s => s.step === stepIndex + 1); // stepIndex suele ser 0-based, o si es 1-based ajustamos.
    if (!currentStepObj) {
      return res.status(400).json({ error: { message: "Paso no encontrado en el enunciado" } });
    }

    // 2. Ejecutar la consulta en la base de datos simulada
    let executionResultData = null;
    try {
      executionResultData = await executeMockQuery(studentSqlCode, activeDb || "punto_venta_db", submission.setupSql);
    } catch (sqlError) {
      // Si hay error SQL, se considera como intento fallido y se devuelve el error SQL (o se evalúa igualmente)
      // Vamos a permitir que el frontend lo maneje
    }

    // 3. Evaluar con IA (Optimizada para ahorrar tokens si la consulta es correcta)
    let evaluation = { isCorrect: false, feedback: "Error interno al evaluar." };
    if (!executionResultData) {
      evaluation = { isCorrect: false, feedback: "Tu consulta tiene errores de sintaxis y no devolvió resultados." };
    } else {
      try {
        evaluation = await aiService.evaluateStep(studentSqlCode, currentStepObj.instruction);
      } catch (aiError) {
        console.error("AI Error en evaluateStep:", aiError);
      }
    }

    // 4. Guardar o actualizar el SubmissionStep
    let stepRecord = await prisma.submissionStep.findUnique({
      where: {
        submissionId_stepIndex: {
          submissionId: submission.id,
          stepIndex: stepIndex
        }
      }
    });

    if (!stepRecord) {
      // Primer intento
      stepRecord = await prisma.submissionStep.create({
        data: {
          submissionId: submission.id,
          stepIndex: stepIndex,
          passedAtFirstTry: evaluation.isCorrect,
          attemptsCount: 1,
          finalSqlCode: evaluation.isCorrect ? studentSqlCode : null,
          completed: evaluation.isCorrect
        }
      });
    } else {
      // Intento subsecuente
      stepRecord = await prisma.submissionStep.update({
        where: { id: stepRecord.id },
        data: {
          attemptsCount: stepRecord.attemptsCount + 1,
          finalSqlCode: evaluation.isCorrect ? studentSqlCode : stepRecord.finalSqlCode,
          completed: evaluation.isCorrect ? true : stepRecord.completed
        }
      });
    }

    // 5. Si es correcto, actualizar el currentStep global de la submission si era el paso actual
    if (evaluation.isCorrect && submission.currentStep === stepIndex) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          currentStep: stepIndex + 1,
          // Si era el último paso, podríamos marcarla como 'pendiente' aquí, pero se puede hacer desde el cliente.
        }
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        isCorrect: evaluation.isCorrect,
        feedback: evaluation.feedback,
        executionResult: executionResultData,
        stepRecord
      }
    });

  } catch (error) {
    next(error);
  }
};
