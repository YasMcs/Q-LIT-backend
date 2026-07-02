import { prisma } from '../config/db.js';

export const getAdminMetrics = async (req, res, next) => {
  try {
    // Verificar que sea admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    const { classroomId } = req.query;

    // Filtros base
    const practiceFilter = classroomId ? { practice: { classroomId } } : {};
    const enrollmentFilter = classroomId ? { classroomId } : {};

    // 1. Obtener todos los logs de error
    const errorLogs = await prisma.practiceErrorLog.findMany({
      where: practiceFilter,
      include: { user: true }
    });

    // 2. Obtener todas las submissions
    const submissions = await prisma.submission.findMany({
      where: practiceFilter
    });

    // 3. Obtener todos los enrollments para calcular el tiempo de interacción
    const enrollments = await prisma.enrollment.findMany({
      where: enrollmentFilter
    });

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

    const firstInteractionAvg = usersWithMultiplePractices > 0 ? (sumErrorsFirstPractice / usersWithMultiplePractices).toFixed(1) : "0.0";
    const lastInteractionAvg = usersWithMultiplePractices > 0 ? (sumErrorsLastPractice / usersWithMultiplePractices).toFixed(1) : "0.0";
    const evolutionImprovement = usersWithMultiplePractices > 0 && sumErrorsFirstPractice > 0 
      ? (((sumErrorsFirstPractice - sumErrorsLastPractice) / sumErrorsFirstPractice) * 100).toFixed(1) 
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
          improvementPercentage: evolutionImprovement + "%"
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
