import * as aiService from '../services/ai.service.js';
import { prisma } from '../config/db.js';
import { sendGradedEmail } from '../services/email.service.js';
import { executeMockQuery } from '../services/sandbox.service.js';
import { translateSqlError } from '../services/errorTranslator.service.js';

export const evaluateSubmission = async (req, res, next) => {
  try {
    const { studentSqlCode, executionResult: resultData, submissionId, practiceId } = req.body;
    const userId = req.user?.id;

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
      // Verificar si la entrega está bloqueada por fecha límite (closeLateSubmissions)
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
      
      // Actualizar el código SQL, resultado, estado de revisión y fecha de entrega
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          studentSqlCode,
          executionResult: resultData ? JSON.stringify(resultData) : null,
          reviewStatus: "pendiente",
          submittedAt: new Date()
        }
      });
    }

    // Ya no hay autoevaluación con IA, el docente califica manualmente.
    res.status(200).json({
      message: "Tu práctica fue enviada exitosamente para revisión.",
      feedback: "El docente asignará tu calificación manualmente."
    });
  } catch (error) {
    next(error); // Pasa el error al manejador global
  }
};

export const confirmTeacherGrade = async (req, res, next) => {
  try {
    const { submissionId, manualGrade } = req.body;

    if (!submissionId || manualGrade === undefined) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Faltan parámetros requeridos: submissionId, manualGrade'
        }
      });
    }

    // 1. Actualizar estado de la entrega a "calificada" y asignar nota
    await prisma.submission.update({
      where: { id: submissionId },
      data: { 
        reviewStatus: "calificada",
        finalGrade: Number(manualGrade)
      }
    });

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
        sendGradedEmail(
          submission.user.email,
          submission.user.name,
          submission.practice.title,
          Number(manualGrade),
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
    let sqlErrorToTranslate = null;
    try {
      executionResultData = await executeMockQuery(studentSqlCode, activeDb || "punto_venta_db", submission.setupSql);
    } catch (sqlError) {
      sqlErrorToTranslate = sqlError;
    }

    // 3. Evaluar con IA (Optimizada para ahorrar tokens si la consulta es correcta)
    let evaluation = { isCorrect: false, feedback: "Error interno al evaluar." };
    if (!executionResultData) {
      let feedback = "Tu consulta tiene errores de sintaxis y no devolvió resultados.";
      if (sqlErrorToTranslate) {
        try {
          const translation = await translateSqlError(sqlErrorToTranslate, studentSqlCode, userId, submission.practiceId);
          feedback = `${translation.mensaje}\n\nSugerencia: ${translation.sugerencia}`;
        } catch (transErr) {
          console.error("Error al traducir error SQL en evaluateStep:", transErr);
        }
      }
      evaluation = { isCorrect: false, feedback };
    } else {
      try {
        evaluation = await aiService.evaluateStep(studentSqlCode, currentStepObj.instruction);
      } catch (aiError) {
        console.error("AI Error en evaluateStep:", aiError);
        
        const expectedConcept = currentStepObj.expectedConcept || "";
        let localFeedback = "Lumi (IA) no está respondiendo en este momento (el servicio de Google está temporalmente fuera de línea). ";
        
        if (expectedConcept) {
          const normalizedConcept = expectedConcept.trim().toUpperCase();
          
          let hasKeyword = false;
          try {
            const regexStr = '\\b' + normalizedConcept.replace(/\s+/g, '\\s+') + '\\b';
            const regex = new RegExp(regexStr, 'i');
            hasKeyword = regex.test(studentSqlCode);
          } catch (regErr) {
            hasKeyword = studentSqlCode.toUpperCase().includes(normalizedConcept);
          }
          
          if (!hasKeyword) {
            const conceptExplanations = {
              "SELECT": "SELECT se utiliza para indicar qué campos o columnas quieres obtener de la tabla.",
              "FROM": "FROM indica de qué tabla o tablas provienen los datos.",
              "WHERE": "WHERE se usa para filtrar los registros aplicando condiciones antes de agrupar o mostrar.",
              "GROUP BY": "GROUP BY se usa para agrupar filas que comparten el mismo valor en ciertas columnas, ideal para usar con COUNT(), SUM(), AVG(), etc.",
              "HAVING": "HAVING se usa para filtrar los resultados de grupos creados por GROUP BY (por ejemplo, filtrar donde COUNT(*) > 5).",
              "ORDER BY": "ORDER BY sirve para ordenar las filas resultantes de forma ascendente (ASC) o descendente (DESC).",
              "JOIN": "JOIN (o INNER JOIN) te permite combinar datos de dos o más tablas basándose en una columna relacionada (llave foránea).",
              "LEFT JOIN": "LEFT JOIN devuelve todas las filas de la tabla izquierda y las filas coincidentes de la tabla derecha.",
              "RIGHT JOIN": "RIGHT JOIN devuelve todas las filas de la tabla derecha y las filas coincidentes de la tabla izquierda.",
              "LIMIT": "LIMIT restringe la cantidad de registros devueltos a un número específico.",
              "SUM": "SUM() es una función para sumar los valores de una columna numérica.",
              "AVG": "AVG() calcula el promedio de los valores de una columna numérica.",
              "COUNT": "COUNT() sirve para contar el número total de filas o elementos.",
              "MAX": "MAX() devuelve el valor máximo encontrado en una columna.",
              "MIN": "MIN() devuelve el valor mínimo encontrado en una columna.",
              "SET": "SET se utiliza junto con UPDATE para indicar qué columnas modificar y qué nuevos valores asignarles.",
              "VALUES": "VALUES se utiliza en la sentencia INSERT para listar los valores correspondientes a las columnas que se van a insertar.",
              "INTO": "INTO se utiliza en INSERT INTO para especificar la tabla en la cual se guardarán los nuevos registros.",
              "ON": "ON especifica la condición de emparejamiento (comúnmente la relación llave primaria y llave foránea) entre las tablas en un JOIN.",
              "AS": "AS se utiliza para renombrar temporalmente columnas o tablas en la consulta (crear un alias) para mayor claridad o brevedad."
            };
            
            const explanation = conceptExplanations[normalizedConcept] || `Esta cláusula o función es fundamental para resolver el paso actual.`;
            localFeedback += `Detectamos localmente que tu consulta no incluye el concepto esperado: '${expectedConcept}'.\n\nSugerencia: ${explanation}`;
          } else {
            localFeedback += `Tu consulta incluye el concepto esperado '${expectedConcept}', pero Lumi no pudo validar si toda la estructura lógica es correcta debido a la indisponibilidad de la IA. Intenta ejecutar de nuevo en unos momentos.`;
          }
        } else {
          localFeedback += "No pudimos evaluar tu lógica de forma automatizada por ahora. Por favor, intenta de nuevo en unos segundos.";
        }

        evaluation = {
          isCorrect: false,
          feedback: localFeedback
        };
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

    const newErrorLog = !evaluation.isCorrect ? {
      query: studentSqlCode,
      errorMessage: evaluation.feedback || "Error de sintaxis o lógica. El objetivo no fue cumplido.",
      timestamp: new Date().toISOString()
    } : null;

    if (!stepRecord) {
      // Primer intento
      stepRecord = await prisma.submissionStep.create({
        data: {
          submissionId: submission.id,
          stepIndex: stepIndex,
          passedAtFirstTry: evaluation.isCorrect,
          attemptsCount: 1,
          finalSqlCode: evaluation.isCorrect ? studentSqlCode : null,
          completed: evaluation.isCorrect,
          errorLogs: newErrorLog ? [newErrorLog] : []
        }
      });
    } else {
      // Intento subsecuente
      let currentLogs = [];
      if (Array.isArray(stepRecord.errorLogs)) {
        currentLogs = stepRecord.errorLogs;
      } else if (typeof stepRecord.errorLogs === 'string') {
        try { currentLogs = JSON.parse(stepRecord.errorLogs); } catch(e) {}
      }
      if (newErrorLog) {
        currentLogs.push(newErrorLog);
      }

      stepRecord = await prisma.submissionStep.update({
        where: { id: stepRecord.id },
        data: {
          attemptsCount: stepRecord.attemptsCount + 1,
          finalSqlCode: evaluation.isCorrect ? studentSqlCode : stepRecord.finalSqlCode,
          completed: evaluation.isCorrect ? true : stepRecord.completed,
          errorLogs: currentLogs
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
