import { Router } from 'express';
import * as evaluationController from '../controllers/evaluation.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Endpoint POST /api/evaluations
router.post('/', bffAuthMiddleware, evaluationController.evaluateSubmission);

export default router;
