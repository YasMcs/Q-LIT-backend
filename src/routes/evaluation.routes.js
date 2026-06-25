import { Router } from 'express';
import * as evaluationController from '../controllers/evaluation.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Endpoint que ejecuta la evaluación de IA
router.post('/', bffAuthMiddleware, evaluationController.evaluateSubmission);
router.post('/teacher-grade', evaluationController.confirmTeacherGrade);

export default router;
