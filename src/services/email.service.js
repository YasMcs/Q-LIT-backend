import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Configurar el transportador de Nodemailer usando las variables de entorno
const transporter = nodemailer.createTransport({
  service: 'gmail', // Configuración rápida para Gmail
  auth: {
    user: process.env.EMAIL_USER, // Tu correo de Gmail (ej. qlit.oficial@gmail.com)
    pass: process.env.EMAIL_PASS  // Tu "Contraseña de aplicación" de 16 letras
  }
});

const SENDER_EMAIL = '"Q-LIT Notificaciones" <' + (process.env.EMAIL_USER || 'noreply@qlit.com') + '>';

/**
 * Plantilla base para todos los correos
 */
const getBaseTemplate = (title, content) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; color: #111827; line-height: 1.5; margin: 0; padding: 40px 20px; }
    .container { max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px; border: 1px solid #f3f4f6; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.03); }
    .header { padding-bottom: 24px; border-bottom: 1px solid #f3f4f6; margin-bottom: 24px; text-align: left; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; color: #111827; }
    .content { background-color: #ffffff; }
    .footer { text-align: left; padding-top: 32px; color: #9ca3af; font-size: 12px; margin-top: 32px; border-top: 1px solid #f3f4f6; }
    .btn { display: inline-block; background-color: #111827; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px; text-align: center; margin-top: 12px; transition: background-color 0.2s; }
    .btn:hover { background-color: #374151; }
    .highlight { font-weight: 600; color: #111827; }
    .info-box { background-color: #f9fafb; padding: 16px 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #f3f4f6; }
  </style>
</head>
<body style="background-color: #f9fafb; padding: 40px 20px;">
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <strong>Q-LIT Laboratorios SQL</strong><br>
      Plataforma interactiva de bases de datos.<br>
      <span style="font-size: 11px; margin-top: 8px; display: inline-block;">Este es un mensaje automático, por favor no respondas a este correo.</span>
    </div>
  </div>
</body>
</html>
`;

/**
 * Helper interno para enviar correo
 */
const sendEmail = async (to, subject, html) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ No se han configurado EMAIL_USER y EMAIL_PASS en el .env. Correo simulado (no enviado a la red).');
    console.log(`[SIMULACIÓN DE CORREO] Para: ${to} | Asunto: ${subject}`);
    return;
  }
  
  try {
    const info = await transporter.sendMail({
      from: SENDER_EMAIL,
      to: to,
      subject: subject,
      html: html,
      text: html.replace(/<[^>]*>?/gm, '').trim() // Extrae solo el texto puro para evitar filtros anti-spam
    });
    console.log(`✅ Correo enviado a ${to} (ID: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error(`❌ Error enviando correo a ${to}:`, error);
    // No lanzamos el error para no detener la ejecución principal
  }
};

/**
 * Envía notificación de nueva práctica
 */
export const sendNewPracticeEmail = async (studentEmail, studentName, practiceTitle, classroomName, deadline) => {
  const subject = `✨ Nueva Práctica Asignada: ${practiceTitle}`;
  const deadlineStr = deadline ? new Date(deadline).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'Sin límite de tiempo';
  
  const content = `
    <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #111827;">Hola, ${studentName || 'Estudiante'} 👋</h2>
    <p style="color: #4b5563; font-size: 15px;">Tu profesor ha publicado un nuevo laboratorio práctico en la clase <span class="highlight">${classroomName}</span>.</p>
    <div class="info-box">
      <p style="margin: 0; color: #111827; font-size: 15px;">📝 <strong>Práctica:</strong> ${practiceTitle}</p>
      <p style="margin: 12px 0 0 0; color: #4b5563; font-size: 14px;">⏰ <strong>Vence:</strong> ${deadlineStr}</p>
    </div>
    <p style="color: #4b5563; font-size: 15px;">Ingresa a Q-LIT para comenzar a resolverla y poner a prueba tu lógica SQL. 🚀</p>
    <div style="margin-top: 32px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Entrar al Laboratorio</a>
    </div>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('✨ Nuevo Laboratorio SQL', content));
};

/**
 * Envía notificación de práctica actualizada
 */
export const sendPracticeUpdatedEmail = async (studentEmail, studentName, practiceTitle, classroomName, deadline) => {
  const subject = `🔄 Recordatorio: ${practiceTitle} (Actualizado)`;
  const deadlineStr = deadline ? new Date(deadline).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'Sin límite de tiempo';
  
  const content = `
    <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #111827;">Hola, ${studentName || 'Estudiante'} 👋</h2>
    <p style="color: #4b5563; font-size: 15px;">Tu profesor ha <strong>modificado algunos detalles</strong> del laboratorio práctico en la clase <span class="highlight">${classroomName}</span>.</p>
    <div class="info-box">
      <p style="margin: 0; color: #111827; font-size: 15px;">📝 <strong>Práctica:</strong> ${practiceTitle}</p>
      <p style="margin: 12px 0 0 0; color: #4b5563; font-size: 14px;">⏰ <strong>Vence:</strong> ${deadlineStr}</p>
    </div>
    <p style="color: #4b5563; font-size: 15px;">Te enviamos este recordatorio para que revises los cambios y te asegures de entregar a tiempo. ⏳</p>
    <div style="margin-top: 32px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Revisar Laboratorio</a>
    </div>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('🔄 Laboratorio Actualizado', content));
};

/**
 * Envía notificación de práctica calificada
 */
export const sendGradedEmail = async (studentEmail, studentName, practiceTitle, score, maxScore) => {
  const subject = `🎓 Práctica Calificada: ${practiceTitle}`;
  
  const content = `
    <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #111827;">Hola, ${studentName || 'Estudiante'} 👋</h2>
    <p style="color: #4b5563; font-size: 15px;">Tu profesor ha finalizado la revisión de tu práctica.</p>
    <div class="info-box" style="text-align: center;">
      <p style="margin: 0; font-size: 15px; color: #4b5563;"><strong>${practiceTitle}</strong></p>
      <h2 style="color: #111827; font-size: 32px; margin: 10px 0;">${score} / ${maxScore}</h2>
    </div>
    <p style="color: #4b5563; font-size: 15px;">Puedes ingresar a Q-LIT para revisar los detalles de tu evaluación y retroalimentación.</p>
    <div style="margin-top: 32px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Ver Calificación</a>
    </div>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('🎓 Práctica Calificada', content));
};

/**
 * Envía notificación de recordatorio de vencimiento
 */
export const sendReminderEmail = async (studentEmail, studentName, practiceTitle, deadline) => {
  const subject = `⚠️ Recordatorio: Práctica por vencer`;
  const deadlineStr = new Date(deadline).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  
  const content = `
    <h2 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #111827;">Hola, ${studentName || 'Estudiante'} 👋</h2>
    <p style="color: #4b5563; font-size: 15px;">Este es un recordatorio amigable de que tienes una práctica que <strong>vence mañana</strong>. 🏃‍♂️</p>
    <div class="info-box" style="border-left: 4px solid #ef4444;">
      <p style="margin: 0; color: #111827; font-size: 15px;">📝 <strong>Práctica:</strong> ${practiceTitle}</p>
      <p style="margin: 12px 0 0 0; color: #b91c1c; font-size: 14px;">⏰ <strong>Vence:</strong> ${deadlineStr}</p>
    </div>
    <p style="color: #4b5563; font-size: 15px;">Aún estás a tiempo de entregarla y evitar penalizaciones.</p>
    <div style="margin-top: 32px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Entregar Práctica</a>
    </div>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('⚠️ Práctica por Vencer', content));
};
