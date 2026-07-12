import { prisma } from '../config/db.js';
import { generateUniqueProblem } from '../services/gemini.service.js';

export const startPractice = async (req, res, next) => {
  try {
    const { practiceId } = req.params;
    const userId = req.user.id;

    // Buscar la práctica para obtener sus datos
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      include: { checklistItems: true }
    });

    if (!practice) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Práctica no encontrada' } });
    }

    let submission = await prisma.submission.findUnique({
      where: {
        userId_practiceId: {
          userId,
          practiceId
        }
      },
      include: {
        steps: true
      }
    });

    // Verificar si la inscripción está activa o archivada
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_classroomId: {
          userId,
          classroomId: practice.classroomId
        }
      }
    });

    const isReadOnly = (submission && (submission.reviewStatus === "pendiente" || submission.reviewStatus === "calificada")) || !enrollment || enrollment.isArchived;

    if ((!enrollment || enrollment.isArchived) && !submission) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'No puedes iniciar prácticas de un laboratorio del cual te has salido.'
        }
      });
    }

    // Verificar si la entrega está bloqueada por fecha límite
    if (!isReadOnly && practice.deadline && practice.closeLateSubmissions) {
      const isLate = new Date() > new Date(practice.deadline);
      if (isLate) {
        return res.status(403).json({
          error: {
            code: 'LATE_SUBMISSIONS_CLOSED',
            message: 'Esta práctica no se puede enviar después de la fecha de entrega.'
          }
        });
      }
    }

    if (!submission) {
      // 1. Llamar a la IA para generar el problema
      const functionsStrList = practice.requiredFunctions?.keywords || [];
      const activeDb = practice.requiredFunctions?.db || "punto_venta_db";
      const generatedJsonStr = await generateUniqueProblem(
        practice.description, 
        functionsStrList,
        activeDb
      );

      let setupSql = null;
      try {
        const parsed = JSON.parse(generatedJsonStr);
        setupSql = parsed.setup_sql;
      } catch (e) {
        console.error("Error parseando respuesta de Gemini JSON:", e);
      }

      // 2. Crear la submission con estado "en_progreso"
      try {
        submission = await prisma.submission.create({
          data: {
            userId,
            practiceId,
            generatedStatement: generatedJsonStr,
            setupSql: setupSql,
            reviewStatus: "en_progreso"
          }
        });
      } catch (err) {
        if (err.code === 'P2002') { // Unique constraint failed (race condition from StrictMode)
          submission = await prisma.submission.findUnique({
            where: {
              userId_practiceId: { userId, practiceId }
            }
          });
        } else {
          throw err;
        }
      }
    }

    // Devolver la práctica junto con el statement generado
    res.status(200).json({
      data: {
        practice: {
          id: practice.id,
          title: practice.title,
          description: practice.description,
          requiredFunctions: practice.requiredFunctions,
          totalPoints: practice.totalPoints,
          deadline: practice.deadline,
          closeLateSubmissions: practice.closeLateSubmissions,
          checklistItems: practice.checklistItems
        },
        submission: {
          id: submission.id,
          generatedStatement: submission.generatedStatement,
          studentSqlCode: submission.studentSqlCode,
          executionResult: typeof submission.executionResult === 'string' ? JSON.parse(submission.executionResult) : submission.executionResult,
          reviewStatus: submission.reviewStatus,
          currentStep: submission.currentStep,
          steps: submission.steps || [],
          isReadOnly: isReadOnly
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

export const getPracticeSubmissions = async (req, res, next) => {
  try {
    const { id: practiceId } = req.params;

    // Buscar la práctica junto con la clase y las inscripciones
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      include: {
        checklistItems: true,
        classroom: {
          include: {
            enrollments: {
              where: { role: 'student' },
              include: {
                user: {
                  select: { id: true, name: true, email: true, image: true }
                }
              }
            }
          }
        }
      }
    });

    if (!practice) {
      return res.status(404).json({ error: { message: "Práctica no encontrada" } });
    }

    // Buscar las entregas (submissions) que sí existen
    const submissions = await prisma.submission.findMany({
      where: { practiceId },
      include: {
        steps: true,
        evaluations: {
          include: {
            checklistItem: true
          }
        }
      }
    });

    const submissionsMap = new Map();
    submissions.forEach(sub => {
      submissionsMap.set(sub.userId, sub);
    });

    // Mapear cada alumno inscrito combinando con su posible entrega
    const formattedStudents = practice.classroom.enrollments.map(enrollment => {
      const student = enrollment.user;
      const sub = submissionsMap.get(student.id);

      if (!sub) {
        // Alumno inscrito pero sin comenzar la práctica
        return {
          studentName: student.name || "Estudiante",
          studentEmail: student.email || "",
          studentId: student.id,
          studentImage: student.image || "",
          status: "NOT_STARTED",
          score: 0,
          submittedAt: null,
          sqlQuery: "",
          executionResult: null,
          checklist: practice.checklistItems.map(item => ({
            id: item.id,
            text: item.criterion,
            aiComplies: false,
            teacherComplies: false
          }))
        };
      }

      // Alumno que ya comenzó o entregó
      let score = sub.finalGrade || 0; // Usar la calificación final manual

      let status = "IN_PROGRESS";
      if (sub.reviewStatus === "calificada") {
        status = "COMPLETED";
      } else if (sub.reviewStatus === "pendiente") {
        status = "PENDING";
      } else if (sub.reviewStatus === "en_progreso" && (!sub.steps || sub.steps.length === 0) && (!sub.studentSqlCode || sub.studentSqlCode.trim() === "")) {
        status = "NOT_STARTED";
      }

      return {
        submissionId: sub.id,
        studentName: student.name || "Estudiante",
        studentEmail: student.email || "",
        studentId: student.id,
        studentImage: student.image || "",
        status,
        score,
        submittedAt: sub.submittedAt,
        sqlQuery: sub.studentSqlCode,
        generatedStatement: sub.generatedStatement,
        steps: sub.steps,
        executionResult: sub.executionResult ? JSON.parse(sub.executionResult) : null,
        checklist: practice.checklistItems.map(item => {
          const ev = sub.evaluations.find(e => e.checklistItemId === item.id);
          return {
            id: item.id,
            text: item.criterion,
            aiComplies: ev ? ev.aiComplies : false,
            teacherComplies: ev ? ev.teacherComplies : null
          };
        })
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        practiceTitle: practice.title,
        practiceDescription: practice.description,
        totalPoints: practice.totalPoints,
        practiceRequiredFunctions: practice.requiredFunctions,
        deadline: practice.deadline,
        students: formattedStudents
      }
    });
  } catch (error) {
    next(error);
  }
};

export const resetPractice = async (req, res, next) => {
  try {
    const { practiceId } = req.params;
    const userId = req.user.id;

    // Buscar la submission existente
    const submission = await prisma.submission.findUnique({
      where: {
        userId_practiceId: {
          userId,
          practiceId
        }
      }
    });

    if (!submission) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No hay ninguna entrega activa para reiniciar.' } });
    }

    // No permitir reiniciar si ya fue entregada
    if (submission.reviewStatus === 'pendiente' || submission.reviewStatus === 'calificada') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'No puedes reiniciar una práctica que ya ha sido entregada o calificada.'
        }
      });
    }

    // Eliminar la submission (la cascada borrará ChecklistEvaluation y SubmissionStep)
    await prisma.submission.delete({
      where: {
        id: submission.id
      }
    });

    res.status(200).json({
      status: "success",
      message: "Práctica reiniciada correctamente."
    });
  } catch (error) {
    next(error);
  }
};
