import { prisma } from '../config/db.js';
import { sendNewPracticeEmail, sendPracticeUpdatedEmail } from '../services/email.service.js';

export const createPractice = async (req, res, next) => {
  try {
    const { 
      title, 
      description, 
      objective, 
      requiredFunctionsStr,
      maxScore, 
      dueDate, 
      dueTime, 
      activeDb, 
      criteria, 
      classroomId,
      closeLateSubmissions 
    } = req.body;

    if (!title || !classroomId) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Faltan parámetros requeridos (título y clase)'
        }
      });
    }

    let deadline = null;
    if (req.body.deadlineIso) {
      deadline = new Date(req.body.deadlineIso);
    } else if (dueDate) {
      const time = dueTime || '23:59';
      deadline = new Date(`${dueDate}T${time}:00`);
    }

    // Usar la descripción proporcionada directamente
    const fullDescription = (description || '').trim();

    // Parse required functions
    const keywords = requiredFunctionsStr 
      ? requiredFunctionsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      : [];

    // Guardar en Prisma
    const newPractice = await prisma.practice.create({
      data: {
        title,
        description: fullDescription,
        requiredFunctions: { db: activeDb, keywords },
        totalPoints: maxScore,
        deadline,
        closeLateSubmissions: Boolean(closeLateSubmissions),
        classroomId,
        checklistItems: {
          create: criteria.map(c => ({
            criterion: c.text,
            maxPoints: c.points
          }))
        }
      },
      include: {
        checklistItems: true
      }
    });

    // Respuesta al cliente
    res.status(201).json(newPractice);

    // Enviar correos en background
    try {
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        include: {
          enrollments: {
            include: { user: true }
          }
        }
      });
      if (classroom && classroom.enrollments) {
        classroom.enrollments.forEach(enrollment => {
          if (enrollment.user.email) {
            sendNewPracticeEmail(
              enrollment.user.email,
              enrollment.user.name,
              title,
              classroom.name,
              deadline
            );
          }
        });
      }
    } catch (emailError) {
      console.error('Error enviando correos de nueva práctica:', emailError);
    }

  } catch (error) {
    next(error);
  }
};

export const updatePractice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      objective, 
      requiredFunctionsStr,
      maxScore, 
      dueDate, 
      dueTime, 
      activeDb, 
      criteria, 
      forceRegenerate,
      closeLateSubmissions 
    } = req.body;

    const existingPractice = await prisma.practice.findUnique({
      where: { id }
    });

    if (!existingPractice) {
      return res.status(404).json({ error: { message: 'Práctica no encontrada' } });
    }

    let deadline = existingPractice.deadline;
    if (req.body.deadlineIso) {
      deadline = new Date(req.body.deadlineIso);
    } else if (dueDate) {
      const time = dueTime || '23:59';
      deadline = new Date(`${dueDate}T${time}:00`);
    }

    const fullDescription = description !== undefined 
      ? (description || '').trim()
      : existingPractice.description;

    const keywords = requiredFunctionsStr !== undefined
      ? requiredFunctionsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      : existingPractice.requiredFunctions.keywords;

    const db = activeDb !== undefined ? activeDb : existingPractice.requiredFunctions.db;

    const updatedPractice = await prisma.practice.update({
      where: { id },
      data: {
        title: title !== undefined ? title : existingPractice.title,
        description: fullDescription,
        requiredFunctions: { db, keywords },
        totalPoints: maxScore !== undefined ? maxScore : existingPractice.totalPoints,
        deadline,
        closeLateSubmissions: closeLateSubmissions !== undefined ? Boolean(closeLateSubmissions) : existingPractice.closeLateSubmissions,
        ...(criteria !== undefined ? {
          checklistItems: {
            deleteMany: {},
            create: criteria.map(c => ({
              criterion: c.text,
              maxPoints: c.points
            }))
          }
        } : {})
      }
    });

    let deletedSubmissionsCount = 0;
    if (forceRegenerate) {
      const deleteResult = await prisma.submission.deleteMany({
        where: {
          practiceId: id,
          reviewStatus: {
            in: ["pendiente", "en_progreso"]
          }
        }
      });
      deletedSubmissionsCount = deleteResult.count;
    }

    // Enviar correos en background de que se actualizó
    try {
      const classroom = await prisma.classroom.findUnique({
        where: { id: updatedPractice.classroomId },
        include: {
          enrollments: {
            include: { user: true }
          }
        }
      });
      if (classroom && classroom.enrollments) {
        classroom.enrollments.forEach(enrollment => {
          if (enrollment.user.email) {
            sendPracticeUpdatedEmail(
              enrollment.user.email,
              enrollment.user.name,
              updatedPractice.title,
              classroom.name,
              updatedPractice.deadline
            );
          }
        });
      }
    } catch (emailError) {
      console.error('Error enviando correos de actualización de práctica:', emailError);
    }

    return res.status(200).json({
      status: "success",
      data: {
        practice: updatedPractice,
        restartedSubmissions: deletedSubmissionsCount
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getPracticesByClassroom = async (req, res, next) => {
  try {
    const { classroomId } = req.params;
    const userId = req.user?.id;

    const include = {
      checklistItems: true,
    };
    if (userId) {
      include.submissions = {
        where: { userId }
      };
    }

    const practices = await prisma.practice.findMany({
      where: { classroomId },
      include,
      orderBy: { createdAt: 'desc' }
    });

    res.json(practices);
  } catch (error) {
    next(error);
  }
};

export const getPracticeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const practice = await prisma.practice.findUnique({
      where: { id },
      include: {
        checklistItems: true
      }
    });

    if (!practice) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Práctica no encontrada'
        }
      });
    }

    res.status(200).json(practice);
  } catch (error) {
    next(error);
  }
};

export const deletePractice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const practice = await prisma.practice.findUnique({
      where: { id }
    });

    if (!practice) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Práctica no encontrada'
        }
      });
    }

    await prisma.practice.delete({
      where: { id }
    });

    res.status(200).json({
      status: "success",
      message: "Práctica eliminada exitosamente"
    });
  } catch (error) {
    next(error);
  }
};
