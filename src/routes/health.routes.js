import { Router } from 'express';
import * as healthController from '../controllers/health.controller.js';

const router = Router();

// Define el contrato público: Método GET en la ruta base ("/")
router.get('/', healthController.getHealth);

export default router;
