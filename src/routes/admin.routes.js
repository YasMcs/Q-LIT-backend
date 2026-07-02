import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { bffAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Endpoint de métricas, protegido por auth
router.get('/metrics', bffAuthMiddleware, adminController.getAdminMetrics);

// Endpoint para listar todos los docentes para el filtro
router.get('/teachers', bffAuthMiddleware, adminController.getAdminTeachers);

export default router;
