import { prisma } from '../config/db.js';

export const getAdminMetrics = async (req, res, next) => {
  try {
    // Verificar que sea admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    const { teacherId } = req.query;

    // Filtros base
    const practiceFilter = teacherId ? { practice: { classroom: { teacherId } } } : {};
    const enrollmentFilter = teacherId ? { classroom: { teacherId } } : {};

    // Obtener IDs de usuarios a excluir (docentes, administradores y profesores de apoyo)
    const teachersAndAdmins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'teacher' },
          { role: 'admin' }
        ]
      },
      select: { id: true }
    });
    const excludedUserIds = new Set(teachersAndAdmins.map(u => u.id));

    const coTeachers = await prisma.enrollment.findMany({
      where: { role: 'co_teacher' },
      select: { userId: true }
    });
    coTeachers.forEach(ct => excludedUserIds.add(ct.userId));

    // 1. Obtener todos los logs de error (excluyendo docentes/apoyo)
    const rawErrorLogs = await prisma.practiceErrorLog.findMany({
      where: practiceFilter,
      include: { user: true }
    });
    const errorLogs = rawErrorLogs.filter(log => !excludedUserIds.has(log.userId));

    // 2. Obtener todas las submissions (excluyendo docentes/apoyo)
    const rawSubmissions = await prisma.submission.findMany({
      where: practiceFilter
    });
    const submissions = rawSubmissions.filter(sub => !excludedUserIds.has(sub.userId));

    // 3. Obtener todos los enrollments (excluyendo docentes/apoyo)
    const rawEnrollments = await prisma.enrollment.findMany({
      where: enrollmentFilter
    });
    const enrollments = rawEnrollments.filter(en => !excludedUserIds.has(en.userId));

    // --- CÁLCULOS POR USUARIO (Engagement) ---
    const userStats = {};

    // Inicializar stats por usuario basado en sus logs y submissions
    errorLogs.forEach(log => {
      if (!userStats[log.userId]) userStats[log.userId] = { firstActivity: log.createdAt, lastActivity: log.createdAt, logs: [] };
      userStats[log.userId].logs.push(log);
      if (log.createdAt < userStats[log.userId].firstActivity) userStats[log.userId].firstActivity = log.createdAt;
      if (log.createdAt > userStats[log.userId].lastActivity) userStats[log.userId].lastActivity = log.createdAt;
    });

    submissions.forEach(sub => {
      if (!userStats[sub.userId]) userStats[sub.userId] = { firstActivity: sub.submittedAt, lastActivity: sub.submittedAt, logs: [] };
      if (sub.submittedAt < userStats[sub.userId].firstActivity) userStats[sub.userId].firstActivity = sub.submittedAt;
      if (sub.submittedAt > userStats[sub.userId].lastActivity) userStats[sub.userId].lastActivity = sub.submittedAt;
    });

    enrollments.forEach(en => {
      if (!userStats[en.userId]) userStats[en.userId] = { firstActivity: en.joinedAt, lastActivity: en.joinedAt, logs: [] };
      if (en.joinedAt < userStats[en.userId].firstActivity) userStats[en.userId].firstActivity = en.joinedAt;
      if (en.joinedAt > userStats[en.userId].lastActivity) userStats[en.userId].lastActivity = en.joinedAt;
    });

    // Clasificar usuarios
    const constantUsersIds = new Set();
    const occasionalUsersIds = new Set();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    for (const [userId, stats] of Object.entries(userStats)) {
      const diffMs = stats.lastActivity.getTime() - stats.firstActivity.getTime();
      if (diffMs >= SEVEN_DAYS_MS) {
        constantUsersIds.add(userId);
      } else {
        occasionalUsersIds.add(userId);
      }
    }

    // --- CÁLCULO DE REINCIDENCIAS ---
    const calculateReincidence = (logs) => {
      const groups = {};
      logs.forEach(log => {
        const key = `${log.userId}-${log.practiceId}-${log.sqlConcept}`;
        if (!groups[key]) groups[key] = 0;
        groups[key]++;
      });

      let totalErrors = logs.length;
      let uniqueErrors = Object.keys(groups).length;
      let reincidences = totalErrors - uniqueErrors; // Errores subsecuentes del mismo tipo

      return {
        totalErrors,
        uniqueErrors,
        reincidences,
        reincidenceRate: totalErrors > 0 ? ((reincidences / totalErrors) * 100).toFixed(2) : "0.00"
      };
    };

    const overallMetrics = calculateReincidence(errorLogs);
    const constantLogs = errorLogs.filter(log => constantUsersIds.has(log.userId));
    const occasionalLogs = errorLogs.filter(log => occasionalUsersIds.has(log.userId));

    const constantMetrics = calculateReincidence(constantLogs);
    const occasionalMetrics = calculateReincidence(occasionalLogs);

    // --- EVOLUCIÓN: Errores en Primera vs Última Práctica ---
    const userPractices = {}; 
    errorLogs.forEach(log => {
      if (!userPractices[log.userId]) userPractices[log.userId] = {};
      if (!userPractices[log.userId][log.practiceId]) {
        userPractices[log.userId][log.practiceId] = { count: 0, firstErrorDate: log.createdAt };
      }
      userPractices[log.userId][log.practiceId].count++;
      if (log.createdAt < userPractices[log.userId][log.practiceId].firstErrorDate) {
         userPractices[log.userId][log.practiceId].firstErrorDate = log.createdAt;
      }
    });

    let sumErrorsFirstPractice = 0;
    let sumErrorsLastPractice = 0;
    let usersWithMultiplePractices = 0;

    Object.values(userPractices).forEach(practicesObj => {
      const practicesArray = Object.values(practicesObj).sort((a, b) => a.firstErrorDate - b.firstErrorDate);
      if (practicesArray.length > 1) {
        sumErrorsFirstPractice += practicesArray[0].count;
        sumErrorsLastPractice += practicesArray[practicesArray.length - 1].count;
        usersWithMultiplePractices++;
      }
    });

    const firstInteractionAvg = usersWithMultiplePractices > 0 ? Math.round(sumErrorsFirstPractice / usersWithMultiplePractices) : 0;
    const lastInteractionAvg = usersWithMultiplePractices > 0 ? Math.round(sumErrorsLastPractice / usersWithMultiplePractices) : 0;
    const evolutionImprovement = usersWithMultiplePractices > 0 && sumErrorsFirstPractice > 0 
      ? (((sumErrorsFirstPractice - sumErrorsLastPractice) / sumErrorsFirstPractice) * 100).toFixed(1) 
      : "0.0";

    // --- REINCIDENCIA: Primera vs Última Práctica ---
    const firstPracticeLogs = [];
    const lastPracticeLogs = [];

    Object.entries(userPractices).forEach(([userId, practicesObj]) => {
      const practicesArray = Object.entries(practicesObj)
        .map(([practiceId, data]) => ({ practiceId, ...data }))
        .sort((a, b) => a.firstErrorDate - b.firstErrorDate);

      if (practicesArray.length > 1) {
        const firstPracticeId = practicesArray[0].practiceId;
        const lastPracticeId = practicesArray[practicesArray.length - 1].practiceId;

        errorLogs.forEach(log => {
          if (log.userId === userId) {
            if (log.practiceId === firstPracticeId) {
              firstPracticeLogs.push(log);
            } else if (log.practiceId === lastPracticeId) {
              lastPracticeLogs.push(log);
            }
          }
        });
      }
    });

    const firstPracticeReincidence = calculateReincidence(firstPracticeLogs);
    const lastPracticeReincidence = calculateReincidence(lastPracticeLogs);

    const firstPracticeReincidenceRate = parseFloat(firstPracticeReincidence.reincidenceRate);
    const lastPracticeReincidenceRate = parseFloat(lastPracticeReincidence.reincidenceRate);
    const reincidenceAbsoluteReduction = (firstPracticeReincidenceRate - lastPracticeReincidenceRate).toFixed(1);
    const reincidenceRelativeReduction = firstPracticeReincidenceRate > 0
      ? (((firstPracticeReincidenceRate - lastPracticeReincidenceRate) / firstPracticeReincidenceRate) * 100).toFixed(1)
      : "0.0";

    // --- RESOLUCIÓN AUTÓNOMA ---
    const practicesWithErrorsSet = new Set();
    errorLogs.forEach(log => {
      practicesWithErrorsSet.add(`${log.userId}-${log.practiceId}`);
    });

    let resolvedPracticesCount = 0;
    submissions.forEach(sub => {
      if (sub.reviewStatus === 'calificada' && practicesWithErrorsSet.has(`${sub.userId}-${sub.practiceId}`)) {
        resolvedPracticesCount++;
      }
    });

    const autonomyRate = practicesWithErrorsSet.size > 0 
      ? ((resolvedPracticesCount / practicesWithErrorsSet.size) * 100).toFixed(2) 
      : "0.00";

    // Respuesta
    res.status(200).json({
      status: 'success',
      data: {
        hypothesis: {
          description: "Reducción de reincidencia en un 30% gracias a la terminal interactiva",
          overallReincidenceRate: overallMetrics.reincidenceRate + "%"
        },
        overall: {
          ...overallMetrics,
          successCases: submissions.filter(s => s.reviewStatus === 'calificada').length,
          totalUsersEvaluated: Object.keys(userStats).length
        },
        engagement: {
          constantUsers: {
            description: "Usuarios con >= 7 días de interacción",
            userCount: constantUsersIds.size,
            ...constantMetrics
          },
          occasionalUsers: {
            description: "Usuarios con < 7 días de interacción",
            userCount: occasionalUsersIds.size,
            ...occasionalMetrics
          }
        },
        evolution: {
          description: "Comparativa de errores entre la primera y la última práctica por alumno",
          firstInteractionAvgErrors: firstInteractionAvg,
          lastInteractionAvgErrors: lastInteractionAvg,
          improvementPercentage: evolutionImprovement + "%",
          firstPracticeReincidenceRate: firstPracticeReincidenceRate.toFixed(1) + "%",
          lastPracticeReincidenceRate: lastPracticeReincidenceRate.toFixed(1) + "%",
          reincidenceAbsoluteReduction: reincidenceAbsoluteReduction + "%",
          reincidenceRelativeReduction: reincidenceRelativeReduction + "%"
        },
        autonomy: {
          description: "Tasa de alumnos que cometieron un error pero lograron resolver la práctica con éxito",
          autonomyRate: autonomyRate + "%",
          totalPracticesWithErrors: practicesWithErrorsSet.size,
          resolvedPractices: resolvedPracticesCount
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminTeachers = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    const teachers = await prisma.user.findMany({
      where: { role: 'teacher' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' }
    });

    res.status(200).json({
      status: 'success',
      data: teachers
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminUsersDirectory = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    // 1. Obtener todos los docentes (usuarios con rol 'teacher', que hayan creado aulas o que participen como profesores de apoyo)
    const teachers = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'teacher' },
          { classroomsCreated: { some: {} } },
          { enrollments: { some: { role: 'co_teacher' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        classroomsCreated: {
          select: {
            id: true,
            name: true,
            group: true,
            _count: {
              select: { enrollments: true }
            }
          }
        },
        enrollments: {
          where: { role: 'co_teacher' },
          select: {
            classroom: {
              select: {
                id: true,
                name: true,
                group: true,
                teacher: {
                  select: {
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // 2. Obtener todas las aulas/grupos con sus estudiantes inscritos
    const classrooms = await prisma.classroom.findMany({
      select: {
        id: true,
        name: true,
        group: true,
        inviteCode: true,
        isArchived: true,
        teacher: {
          select: {
            name: true,
            email: true
          }
        },
        enrollments: {
          select: {
            id: true,
            joinedAt: true,
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // 3. Obtener alumnos que no están en ningún grupo (registrados pero sin enrollments)
    const unassignedStudents = await prisma.user.findMany({
      where: {
        role: 'student',
        enrollments: { none: {} }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      orderBy: { name: 'asc' }
    });

    res.status(200).json({
      status: 'success',
      data: {
        teachers,
        classrooms,
        unassignedStudents
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    const { userId } = req.params;
    const { role } = req.body;

    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: { message: "Rol inválido. Debe ser 'student', 'teacher' o 'admin'." } });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true }
    });

    res.status(200).json({
      status: 'success',
      data: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

export const enrollUserInClassroom = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    const { email, userId, classroomId, role } = req.body;

    let targetUserId = userId;

    if (!targetUserId && email) {
      const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() }
      });
      if (!user) {
        return res.status(404).json({ error: { message: `No se encontró ningún usuario con el correo: ${email}` } });
      }
      targetUserId = user.id;
    }

    if (!targetUserId || !classroomId) {
      return res.status(400).json({ error: { message: "Se requiere userId/email y classroomId." } });
    }

    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_classroomId: {
          userId: targetUserId,
          classroomId
        }
      }
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: { message: "El usuario ya está inscrito en este laboratorio." } });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId }
    });

    let enrollmentRole = role;
    if (!enrollmentRole) {
      enrollmentRole = user.role === 'teacher' ? 'co_teacher' : 'student';
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        userId: targetUserId,
        classroomId,
        role: enrollmentRole
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    res.status(201).json({
      status: 'success',
      data: enrollment
    });
  } catch (error) {
    next(error);
  }
};

export const removeUserFromClassroom = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    const { enrollmentId } = req.params;

    await prisma.enrollment.delete({
      where: { id: enrollmentId }
    });

    res.status(200).json({
      status: 'success',
      message: "Usuario desvinculado correctamente del laboratorio."
    });
  } catch (error) {
    next(error);
  }
};

