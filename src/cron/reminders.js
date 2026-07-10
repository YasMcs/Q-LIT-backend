import cron from 'node-cron';
import { prisma } from '../config/db.js';
import { sendReminderEmail } from '../services/email.service.js';

export const startRemindersCron = () => {
  // Ejecutar todos los días a las 12:00 AM (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    console.log('⏳ Ejecutando Cron Job de Recordatorios de Prácticas...');
    try {
      const now = new Date();
      // Queremos avisar sobre las prácticas que vencen entre las próximas 24 y 48 horas
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // Buscar prácticas que vencen en esa ventana de tiempo
      const upcomingPractices = await prisma.practice.findMany({
        where: {
          deadline: {
            gte: tomorrow,
            lt: dayAfterTomorrow
          }
        },
        include: {
          classroom: {
            include: {
              enrollments: {
                include: { user: true }
              }
            }
          },
          submissions: true
        }
      });

      let emailsSent = 0;

      for (const practice of upcomingPractices) {
        if (!practice.classroom?.enrollments) continue;

        for (const enrollment of practice.classroom.enrollments) {
          const student = enrollment.user;
          // Solo enviar recordatorios a estudiantes, no a maestros de apoyo
          if (!student.email || enrollment.role !== 'student') continue;

          // Verificar si el estudiante ya entregó
          const hasSubmitted = practice.submissions.some(sub => 
            sub.userId === student.id && (sub.reviewStatus === 'pendiente' || sub.reviewStatus === 'calificada')
          );

          if (!hasSubmitted) {
            // El estudiante no ha entregado, enviar correo
            await sendReminderEmail(
              student.email,
              student.name,
              practice.title,
              practice.deadline
            );
            emailsSent++;
          }
        }
      }

      console.log(`✅ Cron Job finalizado. Se enviaron ${emailsSent} correos recordatorios.`);
    } catch (error) {
      console.error('❌ Error en el Cron Job de recordatorios:', error);
    }
  });
};
