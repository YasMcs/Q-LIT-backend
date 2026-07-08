import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Endpoint de métricas, protegido por auth
router.get('/metrics', bffAuthMiddleware, adminController.getAdminMetrics);

// Endpoint para listar todos los docentes para el filtro
router.get('/teachers', bffAuthMiddleware, adminController.getAdminTeachers);

// Endpoint para obtener el directorio completo de usuarios por grupos, docentes y alumnos sin grupo
router.get('/users-directory', bffAuthMiddleware, adminController.getAdminUsersDirectory);

// Endpoints para gestión directa del administrador
router.patch('/users/:userId/role', bffAuthMiddleware, adminController.updateUserRole);
router.post('/enrollments', bffAuthMiddleware, adminController.enrollUserInClassroom);
router.delete('/enrollments/:enrollmentId', bffAuthMiddleware, adminController.removeUserFromClassroom);

export default router;
