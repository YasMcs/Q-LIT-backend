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
      where: { teacherId },
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
      group: c.inviteCode, // Temporalmente usaremos inviteCode como group para no cambiar el schema aún
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
    const { name, inviteCode, teacherId } = req.body;

    if (!name || !inviteCode || !teacherId) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Faltan parámetros requeridos'
        }
      });
    }

    // Verificar si el inviteCode ya existe
    const existing = await prisma.classroom.findUnique({
      where: { inviteCode }
    });

    if (existing) {
      return res.status(400).json({
        error: {
          code: 'CONFLICT',
          message: 'El código de invitación ya está en uso'
        }
      });
    }

    const newClassroom = await prisma.classroom.create({
      data: {
        name,
        inviteCode,
        teacherId
      }
    });

    res.status(201).json({ 
      data: {
        id: newClassroom.id,
        title: newClassroom.name,
        group: newClassroom.inviteCode,
        studentsCount: 0,
        pendingReviews: 0
      }
    });
  } catch (error) {
    next(error);
  }
};
