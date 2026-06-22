import { prisma } from '../config/db.js';
import { generateUniqueProblem } from '../services/gemini.service.js';

export const startPractice = async (req, res, next) => {
  try {
    const { practiceId } = req.params;
    const userId = req.user.id;

    // Buscar la práctica para obtener sus datos
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId }
    });

    if (!practice) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Práctica no encontrada' } });
    }

    // Verificar si el alumno ya tiene una submission para esta práctica
    let submission = await prisma.submission.findUnique({
      where: {
        userId_practiceId: {
          userId,
          practiceId
        }
      }
    });

    if (!submission) {
      // 1. Llamar a la IA para generar el problema
      const functionsStrList = practice.requiredFunctions?.keywords || [];
      const activeDb = practice.requiredFunctions?.db || "punto_venta_db";
      const generatedStatement = await generateUniqueProblem(
        practice.description, 
        functionsStrList,
        activeDb
      );

      // 2. Crear la submission con estado "pendiente"
      submission = await prisma.submission.create({
        data: {
          userId,
          practiceId,
          generatedStatement,
          reviewStatus: "pendiente"
        }
      });
    }

    // Devolver la práctica junto con el statement generado
    res.status(200).json({
      data: {
        practice: {
          id: practice.id,
          title: practice.title,
          requiredFunctions: practice.requiredFunctions,
          totalPoints: practice.totalPoints,
          deadline: practice.deadline
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

    const submissions = await prisma.submission.findMany({
      where: { practiceId },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        },
        evaluations: {
          include: {
            checklistItem: true
          }
        }
      }
    });

    const formattedSubmissions = submissions.map(sub => {
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
        studentName: sub.user?.name || "Estudiante",
        studentId: sub.user?.id || sub.userId,
        status,
        score,
        submittedAt: sub.submittedAt
      };
    });

    res.status(200).json({
      status: "success",
      data: formattedSubmissions
    });
  } catch (error) {
    next(error);
  }
};
