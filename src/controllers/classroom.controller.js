import { prisma } from '../config/db.js';

export const getClassroomsByTeacher = async (req, res, next) => {
  try {
    const { teacherId, archived } = req.query;

    if (!teacherId) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Se requiere el teacherId'
        }
      });
    }

    const showArchived = archived === 'true';

    const classrooms = await prisma.classroom.findMany({
      where: { 
        OR: [
          { teacherId },
          { enrollments: { some: { userId: teacherId, role: 'co_teacher' } } }
        ],
        isArchived: showArchived
      },
      orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { enrollments: { where: { role: 'student' } }, practices: true }
          },
          practices: {
            include: {
              _count: {
                select: {
                  submissions: {
                    where: { reviewStatus: 'pendiente' }
                  }
                }
              }
            }
          }
        }
    });

    // Mapeamos para que coincida con el formato esperado por el frontend
    const formattedClassrooms = classrooms.map(c => {
      const pendingReviews = c.practices.reduce((sum, p) => sum + p._count.submissions, 0);
      
      return {
        id: c.id,
        title: c.name,
        group: c.group || c.inviteCode, 
        inviteCode: c.inviteCode,
        studentsCount: c._count.enrollments,
        pendingReviews,
        createdAt: c.createdAt
      };
    });

    res.status(200).json({ data: formattedClassrooms });
  } catch (error) {
    next(error);
  }
};

export const getClassroomById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const classroom = await prisma.classroom.findUnique({
      where: { id },
      include: {
        enrollments: {
          where: { role: 'student' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          }
        },
        practices: {
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                submissions: {
                  where: { reviewStatus: 'pendiente' }
                }
              }
            }
          }
        }
      }
    });

    if (!classroom) {
      return res.status(404).json({ error: { message: "Clase no encontrada" } });
    }

    res.status(200).json({ data: classroom });
  } catch (error) {
    next(error);
  }
};

export const createClassroom = async (req, res, next) => {
  try {
    const { name, group, teacherId } = req.body;

    if (!name || !teacherId) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Faltan parámetros requeridos'
        }
      });
    }

    // Generar un código de invitación aleatorio de 6 caracteres alfanuméricos
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const newClassroom = await prisma.classroom.create({
      data: {
        name,
        group,
        inviteCode,
        teacherId
      }
    });

    res.status(201).json({ 
      data: {
        id: newClassroom.id,
        title: newClassroom.name,
        group: newClassroom.group || newClassroom.inviteCode,
        inviteCode: newClassroom.inviteCode,
        studentsCount: 0,
        pendingReviews: 0
      }
    });
  } catch (error) {
    next(error);
  }
};

export const joinClassroom = async (req, res, next) => {
  try {
    const { inviteCode } = req.body;
    // req.user viene del middleware de seguridad (BFF)
    const userId = req.user?.id;

    if (!inviteCode) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Se requiere el código de invitación' } });
    }

    // Buscar la clase
    const classroom = await prisma.classroom.findUnique({
      where: { inviteCode }
    });

    if (!classroom) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Laboratorio no encontrado con ese código' } });
    }

    // Verificar si el usuario ya está inscrito
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_classroomId: {
          userId,
          classroomId: classroom.id
        }
      }
    });

    if (existingEnrollment) {
      if (existingEnrollment.isArchived) {
        return res.status(403).json({ 
          error: { 
            code: 'FORBIDDEN', 
            message: 'Ya no puedes volver a unirte a este laboratorio porque te has salido de él.' 
          } 
        });
      }
      return res.status(400).json({ error: { code: 'CONFLICT', message: 'Ya estás inscrito en este laboratorio' } });
    }

    let enrollmentRole = 'student';
    if (req.user?.role === 'teacher') {
      const coTeachersCount = await prisma.enrollment.count({
        where: { classroomId: classroom.id, role: 'co_teacher' }
      });
      if (coTeachersCount >= 2) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Límite de profesores de apoyo alcanzado (Máximo 2)' } });
      }
      enrollmentRole = 'co_teacher';
    }

    // Crear la inscripción
    await prisma.enrollment.create({
      data: {
        userId,
        classroomId: classroom.id,
        role: enrollmentRole
      }
    });

    res.status(200).json({ message: 'Te has unido exitosamente al laboratorio' });
  } catch (error) {
    next(error);
  }
};

export const getClassroomsByStudent = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { archived } = req.query;
    const showArchived = archived === 'true';

    const enrollments = await prisma.enrollment.findMany({
      where: { 
        userId,
        isArchived: showArchived,
        classroom: {
          isArchived: false
        }
      },
      include: {
        classroom: {
          include: {
            teacher: { select: { name: true } }
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    const formattedClassrooms = enrollments.map(e => ({
      id: e.classroom.id,
      enrollmentId: e.id,
      title: e.classroom.name,
      teacher: e.classroom.teacher?.name || "Profesor",
      isArchived: e.isArchived,
      envStatus: "Terminal Ready" // Status para el frontend
    }));

    res.status(200).json({ data: formattedClassrooms });
  } catch (error) {
    next(error);
  }
};

// Endpoint de estado del alumno: retorna si tiene inscripción activa y/o archivadas
// Útil para que el frontend sepa qué vista mostrar al cargar
export const getStudentEnrollmentStatus = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: "No autorizado" } });
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId,
        classroom: {
          isArchived: false
        }
      },
      include: {
        classroom: {
          include: {
            teacher: { select: { name: true } }
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    const active = enrollments
      .filter(e => !e.isArchived)
      .map(e => ({
        id: e.classroom.id,
        enrollmentId: e.id,
        title: e.classroom.name,
        teacher: e.classroom.teacher?.name || "Profesor",
        isArchived: false,
        envStatus: "Terminal Ready"
      }));

    const archived = enrollments
      .filter(e => e.isArchived)
      .map(e => ({
        id: e.classroom.id,
        enrollmentId: e.id,
        title: e.classroom.name,
        teacher: e.classroom.teacher?.name || "Profesor",
        isArchived: true,
        envStatus: "Terminal Ready"
      }));

    res.status(200).json({
      hasActiveEnrollment: active.length > 0,
      hasArchivedEnrollments: archived.length > 0,
      active,
      archived
    });
  } catch (error) {
    next(error);
  }
};

export const leaveClassroom = async (req, res, next) => {
  try {
    const classroomId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: { message: "No autorizado" } });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_classroomId: {
          userId,
          classroomId
        }
      }
    });

    if (!enrollment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Inscripción no encontrada' } });
    }

    await prisma.enrollment.update({
      where: {
        id: enrollment.id
      },
      data: {
        isArchived: true
      }
    });

    res.status(200).json({ message: 'Te has salido exitosamente del laboratorio' });
  } catch (error) {
    next(error);
  }
};

export const unarchiveClassroomStudent = async (req, res, next) => {
  try {
    const classroomId = req.params.id;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: { message: "No autorizado" } });
    }
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_classroomId: {
          userId,
          classroomId
        }
      }
    });
    if (!enrollment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Inscripción no encontrada' } });
    }
    await prisma.enrollment.update({
      where: {
        id: enrollment.id
      },
      data: {
        isArchived: false
      }
    });
    res.status(200).json({ message: 'Laboratorio desarchivado exitosamente' });
  } catch (error) {
    next(error);
  }
};

export const archiveClassroom = async (req, res, next) => {
  try {
    const { id } = req.params;

    const classroom = await prisma.classroom.findUnique({
      where: { id }
    });

    if (!classroom) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Clase/Laboratorio no encontrado'
        }
      });
    }

    await prisma.classroom.update({
      where: { id },
      data: { isArchived: true }
    });

    res.status(200).json({
      status: "success",
      message: "Clase archivada exitosamente"
    });
  } catch (error) {
    next(error);
  }
};

export const updateClassroom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, group, isArchived } = req.body;

    const classroom = await prisma.classroom.findUnique({
      where: { id }
    });

    if (!classroom) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Clase/Laboratorio no encontrado'
        }
      });
    }

    const updated = await prisma.classroom.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(group !== undefined && { group }),
        ...(isArchived !== undefined && { isArchived })
      }
    });

    res.status(200).json({
      status: "success",
      data: {
        id: updated.id,
        title: updated.name,
        group: updated.group || updated.inviteCode,
        inviteCode: updated.inviteCode,
        isArchived: updated.isArchived
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getTeacherStatistics = async (req, res, next) => {
  try {
    const { teacherId, classroomId } = req.query;

    if (!teacherId) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Se requiere el teacherId'
        }
      });
    }

    // 1. Obtener todas las clases del docente (activas)
    const classrooms = await prisma.classroom.findMany({
      where: {
        OR: [
          { teacherId },
          { enrollments: { some: { userId: teacherId, role: 'co_teacher' } } }
        ],
        isArchived: false,
        ...(classroomId && classroomId !== 'all' ? { id: classroomId } : {})
      },
      include: {
        enrollments: {
          where: { role: 'student' },
          include: {
            user: true
          }
        },
        practices: {
          include: {
            checklistItems: true,
            submissions: {
              include: {
                evaluations: {
                  include: {
                    checklistItem: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // 2. Calcular estadísticas globales
    let totalScoreSum = 0;
    let totalSubmissionsEvaluated = 0;
    let globalStatsApprovedCount = 0;
    
    let totalExpectedSubmissions = 0;
    let totalActualSubmissions = 0; // pendiente o calificada
    
    const studentsRiskIds = new Set();
    const studentsScores = {}; // Map of studentId -> { totalScore: 0, count: 0 }
    
    // Categorías de temas críticos
    const CATEGORIES = [
      { keywords: ['ORDER BY'], label: 'Cláusula ORDER BY', total: 0, failed: 0 },
      { keywords: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'AGREGACIÓN', 'AGRUPACIÓN', 'AGREGACION', 'AGRUPACION'], label: 'Funciones de Agregación (COUNT, SUM)', total: 0, failed: 0 },
      { keywords: ['LIMIT'], label: 'Delimitador LIMIT', total: 0, failed: 0 },
      { keywords: ['LIKE'], label: 'Búsqueda con LIKE', total: 0, failed: 0 },
      { keywords: ['JOIN', 'INNER JOIN', 'LEFT JOIN'], label: 'Cláusula JOIN (Relaciones)', total: 0, failed: 0 },
      { keywords: ['WHERE'], label: 'Cláusula WHERE (Filtros)', total: 0, failed: 0 },
      { keywords: ['GROUP BY'], label: 'Agrupamiento con GROUP BY', total: 0, failed: 0 }
    ];

    const classStats = [];
    const allStudentIds = new Set();

    // Iterar sobre cada clase
    for (const cls of classrooms) {
      const numStudents = cls.enrollments.length;
      const numPractices = cls.practices.length;
      
      cls.enrollments.forEach(enr => allStudentIds.add(enr.userId));
      
      totalExpectedSubmissions += numStudents * numPractices;
      
      let classScoreSum = 0;
      let classSubmissionsCount = 0;

      for (const practice of cls.practices) {
        const totalPoints = practice.totalPoints || 100;
        
        for (const sub of practice.submissions) {
          const isSubmitted = sub.reviewStatus === 'pendiente' || sub.reviewStatus === 'calificada';
          if (isSubmitted) {
            totalActualSubmissions++;
            
            // Calcular puntaje obtenido en esta entrega
            let subScore = 0;
            if (sub.finalGrade !== null && sub.finalGrade !== undefined) {
              subScore = sub.finalGrade;
            } else {
              sub.evaluations.forEach(ev => {
                const complies = ev.teacherComplies !== null ? ev.teacherComplies : ev.aiComplies;
                if (complies && ev.checklistItem) {
                  subScore += ev.checklistItem.maxPoints;
                }
              });
            }

            // Normalizar a base 100
            const percentageScore = (subScore / totalPoints) * 100;
            
            totalScoreSum += percentageScore;
            totalSubmissionsEvaluated++;
            
            classScoreSum += percentageScore;
            classSubmissionsCount++;

            // Contabilizar entregas aprobadas (calificación >= 60%)
            if (percentageScore >= 60) {
              if (!globalStatsApprovedCount) {
                globalStatsApprovedCount = 0;
              }
              globalStatsApprovedCount++;
            }
            
            // Registrar para promedio de alumnos
            if (!studentsScores[sub.userId]) {
              studentsScores[sub.userId] = { total: 0, count: 0 };
            }
            studentsScores[sub.userId].total += percentageScore;
            studentsScores[sub.userId].count++;
          }
          
          // Alumno con entrega atrasada / vencida y no resuelta
          const isLate = practice.deadline && new Date() > new Date(practice.deadline);
          if (isLate && sub.reviewStatus === 'en_progreso') {
            studentsRiskIds.add(sub.userId);
          }
        }

        // Estudiantes inscritos que no han iniciado la práctica y ya está vencida
        if (practice.deadline && new Date() > new Date(practice.deadline)) {
          const studentIdsWithSub = practice.submissions.map(s => s.userId);
          cls.enrollments.forEach(enrollment => {
            if (!studentIdsWithSub.includes(enrollment.userId)) {
              studentsRiskIds.add(enrollment.userId);
            }
          });
        }
      }

      // Rendimiento de esta clase
      const avgClassScore = classSubmissionsCount > 0 
        ? Math.round(classScoreSum / classSubmissionsCount) 
        : null; // null si no hay entregas
      
      let status = 'empty';
      if (avgClassScore !== null) {
        status = 'good';
        if (avgClassScore < 60) status = 'poor';
        else if (avgClassScore < 80) status = 'average';
      }

      classStats.push({
        id: cls.id,
        name: cls.name,
        group: cls.group || cls.inviteCode,
        avgScore: avgClassScore,
        status
      });
    }

    // Calcular estudiantes con promedio bajo (< 60) como estudiantes en riesgo
    Object.entries(studentsScores).forEach(([studentId, data]) => {
      const avg = data.total / data.count;
      if (avg < 60) {
        studentsRiskIds.add(studentId);
      }
    });

    // Calcular KPI globales
    const learningPercentage = totalSubmissionsEvaluated > 0
      ? Math.round(totalScoreSum / totalSubmissionsEvaluated)
      : 100; // Por defecto 100% si no hay entregas

    const deliveryRate = totalExpectedSubmissions > 0
      ? Math.round((totalActualSubmissions / totalExpectedSubmissions) * 100)
      : 100; // Por defecto 100% si no hay asignaciones

    const studentsAtRisk = studentsRiskIds.size;

    // Calcular Tasa de Aprobación (calificación >= 60)
    // Usamos una variable global inicializada antes del bucle
    const approvalRate = totalSubmissionsEvaluated > 0
      ? Math.round(((globalStatsApprovedCount || 0) / totalSubmissionsEvaluated) * 100)
      : 100;

    // --- Temas Críticos usando PracticeErrorLog ---
    let struggles = [];

    const errorLogs = await prisma.practiceErrorLog.findMany({
      where: {
        userId: { in: Array.from(allStudentIds) }
      }
    });

    if (errorLogs.length > 0) {
      // Calcular Temas Críticos (struggles)
      const conceptCounts = {};
      errorLogs.forEach(log => {
        let concept = log.sqlConcept || "Sintaxis General";
        // Homogeneizar conceptos redundantes
        if (concept === "General" || concept === "Sintaxis" || concept === "Sintaxis General") {
          concept = "Sintaxis General";
        }
        if (!conceptCounts[concept]) conceptCounts[concept] = 0;
        conceptCounts[concept]++;
      });

      const totalErrors = errorLogs.length;
      struggles = Object.entries(conceptCounts)
        .map(([concept, count]) => {
          // Mapear a etiquetas visuales hermosas y claras
          const friendlyLabels = {
            "Sintaxis General": "Sintaxis General",
            "WHERE": "Filtros (WHERE)",
            "JOIN": "Combinaciones (JOIN)",
            "INNER JOIN": "Combinaciones (JOIN)",
            "LEFT JOIN": "Combinaciones (JOIN)",
            "GROUP BY": "Agrupaciones (GROUP BY)",
            "ORDER BY": "Ordenamiento (ORDER BY)",
            "SELECT": "Consultas Básicas (SELECT)",
            "LIMIT": "Límites (LIMIT)",
            "LIKE": "Búsquedas (LIKE)"
          };
          return {
            topic: friendlyLabels[concept] || concept,
            failRate: Math.round((count / totalErrors) * 100),
            level: (count / totalErrors) >= 0.4 ? 'high' : (count / totalErrors) >= 0.2 ? 'medium' : 'low'
          };
        })
        .sort((a, b) => b.failRate - a.failRate)
        .slice(0, 4);
    }

    // Fallbacks si no hay temas registrados aún
    if (struggles.length === 0) {
      struggles.push(
        { "topic": "Cláusula JOIN", "failRate": 0, "level": "low" },
        { "topic": "Cláusula WHERE", "failRate": 0, "level": "low" },
        { "topic": "Funciones de Agregación", "failRate": 0, "level": "low" },
        { "topic": "Sintaxis General", "failRate": 0, "level": "low" }
      );
    }

    res.status(200).json({
      globalStats: {
        learningPercentage,
        deliveryRate,
        studentsAtRisk,
        approvalRate
      },
      struggles,
      classStats
    });

  } catch (error) {
    next(error);
  }
};

export const getTeacherStudents = async (req, res, next) => {
  try {
    const { teacherId, classroomId } = req.query;

    if (!teacherId) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Se requiere el teacherId'
        }
      });
    }

    // 1. Obtener todas las clases del docente (activas)
    const classrooms = await prisma.classroom.findMany({
      where: {
        OR: [
          { teacherId },
          { enrollments: { some: { userId: teacherId, role: 'co_teacher' } } }
        ],
        isArchived: false,
        ...(classroomId && classroomId !== 'all' ? { id: classroomId } : {})
      },
      include: {
        enrollments: {
          where: { role: 'student' },
          include: {
            user: true
          }
        },
        practices: {
          include: {
            checklistItems: true,
            submissions: {
              include: {
                evaluations: {
                  include: {
                    checklistItem: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const studentsList = [];

    // 2. Iterar sobre cada clase y sus alumnos inscritos
    for (const cls of classrooms) {
      const groupName = cls.group || cls.inviteCode || "A";

      for (const enrollment of cls.enrollments) {
        const student = enrollment.user;
        const practicesHistory = [];
        
        let totalScoreSum = 0;
        let evaluatedPracticesCount = cls.practices.length;

        for (const practice of cls.practices) {
          const totalPoints = practice.totalPoints || 100;
          const sub = practice.submissions.find(s => s.userId === student.id);
          
          let score = 0;
          let dateStr = "No entregada";

          if (sub && (sub.reviewStatus === 'pendiente' || sub.reviewStatus === 'calificada')) {
            // Calcular score
            if (sub.finalGrade !== null && sub.finalGrade !== undefined) {
              score = sub.finalGrade;
            } else {
              sub.evaluations.forEach(ev => {
                const complies = ev.teacherComplies !== null ? ev.teacherComplies : ev.aiComplies;
                if (complies && ev.checklistItem) {
                  score += ev.checklistItem.maxPoints;
                }
              });
            }
            
            // Normalizar a base 100
            score = Math.round((score / totalPoints) * 100);
            
            // Formatear fecha (ej. "15 May")
            if (sub.submittedAt) {
              const date = new Date(sub.submittedAt);
              const day = date.getDate();
              const month = date.toLocaleDateString("es-ES", { month: 'short' }).replace('.', '');
              dateStr = `${day} ${month}`;
            }
          }

          totalScoreSum += score;

          practicesHistory.push({
            id: practice.id,
            title: practice.title,
            score,
            date: dateStr
          });
        }

        const average = evaluatedPracticesCount > 0 
          ? Math.round(totalScoreSum / evaluatedPracticesCount) 
          : 100; // 100 por defecto si no hay prácticas

        studentsList.push({
          id: `${student.id}_${cls.id}`,
          name: student.name || "Estudiante",
          email: student.email || "",
          image: student.image || null,
          group: groupName,
          average,
          practices: practicesHistory
        });
      }
    }

    res.status(200).json({
      students: studentsList
    });

  } catch (error) {
    next(error);
  }
};

