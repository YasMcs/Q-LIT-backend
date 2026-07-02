import { prisma } from '../config/db.js';

export const getAdminMetrics = async (req, res, next) => {
  try {
    // Verificar que sea admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: { message: "Acceso denegado. Se requiere rol de administrador." } });
    }

    // 1. Obtener todos los logs de error
    const errorLogs = await prisma.practiceErrorLog.findMany({
      include: { user: true }
    });

    // 2. Obtener todas las submissions calificadas para "Casos de éxito"
    // Un caso de éxito lo consideraremos una submission con reviewStatus = 'calificada' y puntaje mayor a 0.
    // Para simplificar, tomaremos todas las "calificadas" como éxito de finalización de práctica.
    const submissions = await prisma.submission.findMany({
      where: {
        reviewStatus: 'calificada'
      }
    });

    // 3. Obtener todos los enrollments para calcular el tiempo de interacción
    const enrollments = await prisma.enrollment.findMany();

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

    // --- TOP ERRORES ---
    const errorCategoriesCount = {};
    errorLogs.forEach(log => {
      const cat = log.errorCategory || 'General';
      if (!errorCategoriesCount[cat]) errorCategoriesCount[cat] = 0;
      errorCategoriesCount[cat]++;
    });

    const errorCategories = Object.entries(errorCategoriesCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

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
          successCases: submissions.length,
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
        errorCategories
      }
    });
  } catch (error) {
    next(error);
  }
};
