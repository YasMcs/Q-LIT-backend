import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './src/middlewares/errorHandler.js';
import healthRoutes from './src/routes/health.routes.js';
import evaluationRoutes from './src/routes/evaluation.routes.js';
import classroomRoutes from './src/routes/classroom.routes.js';
import userRoutes from './src/routes/user.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares globales
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/health', healthRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/users', userRoutes);

// Manejador global de errores (debe ir al final)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
