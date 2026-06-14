import { prisma } from '../config/db.js';

export const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || (role !== 'teacher' && role !== 'student')) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Rol inválido. Debe ser "teacher" o "student".'
        }
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role }
    });

    res.status(200).json({
      message: 'Rol actualizado exitosamente',
      data: {
        id: updatedUser.id,
        role: updatedUser.role
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Usuario no encontrado'
        }
      });
    }
    next(error);
  }
};
