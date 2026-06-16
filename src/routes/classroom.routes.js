import { Router } from 'express';
import * as classroomController from '../controllers/classroom.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Rutas de Docente (sin middleware temporalmente para no romper la app actual)
router.get('/', classroomController.getClassroomsByTeacher);
router.post('/', classroomController.createClassroom);

// Rutas de Alumno (protegidas con BFF Middleware)
router.post('/join', bffAuthMiddleware, classroomController.joinClassroom);
router.get('/student', bffAuthMiddleware, classroomController.getClassroomsByStudent);

export default router;
