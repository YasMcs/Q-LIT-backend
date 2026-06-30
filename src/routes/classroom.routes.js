import { Router } from 'express';
import * as classroomController from '../controllers/classroom.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Rutas de Alumno (protegidas con BFF Middleware)
router.post('/join', bffAuthMiddleware, classroomController.joinClassroom);
router.get('/student/status', bffAuthMiddleware, classroomController.getStudentEnrollmentStatus);
router.get('/student', bffAuthMiddleware, classroomController.getClassroomsByStudent);
router.post('/:id/leave', bffAuthMiddleware, classroomController.leaveClassroom);
router.patch('/:id/unarchive-student', bffAuthMiddleware, classroomController.unarchiveClassroomStudent);

// Rutas de Docente (sin middleware temporalmente para no romper la app actual)
router.get('/', classroomController.getClassroomsByTeacher);
router.get('/teacher/statistics', classroomController.getTeacherStatistics);
router.get('/teacher/students', classroomController.getTeacherStudents);
router.get('/:id', classroomController.getClassroomById);
router.post('/', classroomController.createClassroom);
router.delete('/:id', classroomController.archiveClassroom);
router.patch('/:id', classroomController.updateClassroom);

export default router;
