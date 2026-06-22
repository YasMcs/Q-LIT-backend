import { prisma } from '../config/db.js';

export const getClassroomsByTeacher = async (req, res, next) => {
  try {
    const { teacherId } = req.query;

    if (!teacherId) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Se requiere el teacherId'
        }
      });
    }

    const classrooms = await prisma.classroom.findMany({
      where: { 
        teacherId,
        isArchived: false
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { enrollments: true, practices: true }
        }
      }
    });

    // Mapeamos para que coincida con el formato esperado por el frontend
    const formattedClassrooms = classrooms.map(c => ({
      id: c.id,
      title: c.name,
      group: c.group || c.inviteCode, 
      inviteCode: c.inviteCode,
      studentsCount: c._count.enrollments,
      pendingReviews: 0, // Se calculará después
      createdAt: c.createdAt
    }));

    res.status(200).json({ data: formattedClassrooms });
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
      return res.status(400).json({ error: { code: 'CONFLICT', message: 'Ya estás inscrito en este laboratorio' } });
    }

    // Crear la inscripción
    await prisma.enrollment.create({
      data: {
        userId,
        classroomId: classroom.id
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

    const formattedClassrooms = enrollments.map(e => ({
      id: e.classroom.id,
      title: e.classroom.name,
      teacher: e.classroom.teacher?.name || "Profesor",
      envStatus: "Terminal Ready" // Status para el frontend
    }));

    res.status(200).json({ data: formattedClassrooms });
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
