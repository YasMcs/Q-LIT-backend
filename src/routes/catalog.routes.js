import express from 'express';
import { listCatalogs } from '../controllers/catalog.controller.js';

const router = express.Router();

router.get('/', listCatalogs);

export default router;
