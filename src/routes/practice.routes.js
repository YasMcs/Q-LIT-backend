import { Router } from 'express';
import * as practiceController from '../controllers/practice.controller.js';
import * as submissionController from '../controllers/submission.controller.js';
import * as executionController from '../controllers/execution.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Todas las rutas de prácticas están protegidas
router.use(bffAuthMiddleware);

// Create a new practice
router.post('/', practiceController.createPractice);

// Get a specific practice
router.get('/:id', practiceController.getPracticeById);

// Update a practice
router.put('/:id', practiceController.updatePractice);

// Delete a practice
router.delete('/:id', practiceController.deletePractice);

router.get('/classroom/:classroomId', practiceController.getPracticesByClassroom);

// Get all submissions for a practice
router.get('/:id/submissions', submissionController.getPracticeSubmissions);

// Ruta para iniciar una práctica (Estudiante)
router.post('/:practiceId/start', submissionController.startPractice);

// Execute SQL query (Sandbox Mock)
router.post('/:practiceId/execute', executionController.executePracticeQuery);

export default router;
