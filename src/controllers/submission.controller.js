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
      }
    });

    if (submission && (submission.reviewStatus === "pendiente" || submission.reviewStatus === "calificada")) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Ya has entregado esta práctica y no puedes volver a ingresar.'
        }
      });
    }

    // Verificar si la entrega está bloqueada por fecha límite
    if (practice.deadline && practice.closeLateSubmissions) {
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

      let statementText = generatedJsonStr;
      let setupSql = null;
      try {
        const parsed = JSON.parse(generatedJsonStr);
        statementText = parsed.historia;
        setupSql = parsed.setup_sql;
      } catch (e) {
        console.error("Error parseando respuesta de Gemini JSON:", e);
      }

      // 2. Crear la submission con estado "en_progreso"
      submission = await prisma.submission.create({
        data: {
          userId,
          practiceId,
          generatedStatement: statementText,
          setupSql: setupSql,
          reviewStatus: "en_progreso"
        }
      });
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
          reviewStatus: submission.reviewStatus
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
        classroom: {
          include: {
            enrollments: {
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
          status: "NOT_STARTED",
          score: 0,
          submittedAt: null,
          sqlQuery: "",
          executionResult: null,
          checklist: []
        };
      }

      // Alumno que ya comenzó o entregó
      let score = 0;
      sub.evaluations.forEach(ev => {
        const complies = ev.teacherComplies !== null 
          ? ev.teacherComplies 
          : ev.aiComplies;
        
        if (complies && ev.checklistItem) {
          score += ev.checklistItem.maxPoints;
        }
      });

      let status = "IN_PROGRESS";
      if (sub.reviewStatus === "calificada") {
        status = "COMPLETED";
      } else if (sub.reviewStatus === "pendiente") {
        status = "PENDING";
      }

      return {
        submissionId: sub.id,
        studentName: student.name || "Estudiante",
        studentEmail: student.email || "",
        studentId: student.id,
        status,
        score,
        submittedAt: sub.submittedAt,
        sqlQuery: sub.studentSqlCode,
        executionResult: sub.executionResult ? JSON.parse(sub.executionResult) : null,
        checklist: sub.evaluations.map(ev => ({
          id: ev.checklistItem?.id,
          text: ev.checklistItem?.criterion,
          maxPoints: ev.checklistItem?.maxPoints,
          aiComplies: ev.aiComplies,
          teacherComplies: ev.teacherComplies,
          iaPoints: ev.aiComplies ? ev.checklistItem?.maxPoints : 0,
          teacherPoints: ev.teacherComplies !== null 
            ? (ev.teacherComplies ? ev.checklistItem?.maxPoints : 0) 
            : (ev.aiComplies ? ev.checklistItem?.maxPoints : 0)
        }))
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        practiceTitle: practice.title,
        practiceDescription: practice.description,
        deadline: practice.deadline,
        students: formattedStudents
      }
    });
  } catch (error) {
    next(error);
  }
};
