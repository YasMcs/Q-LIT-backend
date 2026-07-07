import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { errorHandler } from './src/middlewares/errorHandler.js';
import { startRemindersCron } from './src/cron/reminders.js';
import healthRoutes from './src/routes/health.routes.js';
import evaluationRoutes from './src/routes/evaluation.routes.js';
import classroomRoutes from './src/routes/classroom.routes.js';
import practiceRoutes from './src/routes/practice.routes.js';
import userRoutes from './src/routes/user.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

// Configuración de orígenes permitidos
const allowedOrigins = [
  'http://localhost:3000',
  'https://q-lit.online',
  'https://www.q-lit.online'
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Configurar CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
};

// Middlewares globales
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

// Limitador de peticiones general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Límite por alumno
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  message: { error: { message: 'Demasiadas peticiones, por favor intenta de nuevo más tarde.' } },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// Limitador de peticiones para evaluaciones (Gemini)
const evaluationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 150, // Límite por alumno
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  message: { error: { message: 'Has excedido el límite de evaluaciones permitidas por hora.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

import catalogRoutes from './src/routes/catalog.routes.js';
import adminRoutes from './src/routes/admin.routes.js';

// Rutas
app.use('/api/health', healthRoutes);
app.use('/api/evaluations', evaluationLimiter, evaluationRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/practices', practiceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/admin', adminRoutes);

// Manejador global de errores (debe ir al final)
app.use(errorHandler);

// Iniciar cron jobs
startRemindersCron();

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
