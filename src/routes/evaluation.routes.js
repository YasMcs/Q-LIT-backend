import { Router } from 'express';
import * as evaluationController from '../controllers/evaluation.controller.js';

const router = Router();

// Endpoint POST /api/evaluations
router.post('/', evaluationController.evaluateSubmission);

export default router;
