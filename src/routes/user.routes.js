import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';

const router = Router();

// Endpoint para actualizar el rol del usuario
router.put('/:id/role', userController.updateUserRole);

export default router;
