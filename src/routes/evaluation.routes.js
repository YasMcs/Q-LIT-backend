import { Router } from 'express';
import * as evaluationController from '../controllers/evaluation.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { evaluateSubmissionSchema } from '../schemas/evaluation.schema.js';

const router = Router();

// Endpoint que ejecuta la evaluación de IA
router.post('/', bffAuthMiddleware, validateRequest(evaluateSubmissionSchema), evaluationController.evaluateSubmission);
router.post('/step', bffAuthMiddleware, evaluationController.evaluateStep);
router.post('/teacher-grade', evaluationController.confirmTeacherGrade);
router.post('/assign-zero', evaluationController.assignZeroGrade);

export default router;
