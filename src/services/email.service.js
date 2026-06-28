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
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; line-height: 1.6; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #4f46e5; color: #ffffff; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; background-color: #ffffff; }
    .footer { text-align: center; padding: 24px; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9; background-color: #f8fafc; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; text-align: center; }
    .highlight { color: #4f46e5; font-weight: bold; }
    .info-box { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; }
  </style>
</head>
<body style="background-color: #f1f5f9; padding: 40px 20px;">
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
      <span style="font-size: 11px; opacity: 0.8; margin-top: 10px; display: inline-block;">Este es un correo automático, por favor no respondas a este mensaje.</span>
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
  const subject = `Nueva Práctica Asignada: ${practiceTitle}`;
  const deadlineStr = deadline ? new Date(deadline).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'Sin límite de tiempo';
  
  const content = `
    <h2 style="margin-top: 0; color: #1e293b;">Hola, ${studentName || 'Estudiante'} 👋</h2>
    <p style="color: #475569; font-size: 16px;">Tu profesor ha publicado un nuevo laboratorio práctico en la clase <span class="highlight">${classroomName}</span>.</p>
    <div class="info-box">
      <p style="margin: 0; color: #1e293b; font-size: 16px;"><strong>Práctica:</strong> ${practiceTitle}</p>
      <p style="margin: 12px 0 0 0; color: #475569; font-size: 15px;"><strong>Vence:</strong> ${deadlineStr}</p>
    </div>
    <p style="color: #475569; font-size: 16px;">Ingresa a Q-LIT para comenzar a resolverla y poner a prueba tu lógica SQL.</p>
    <div style="text-align: center; margin-top: 36px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Entrar al Laboratorio</a>
    </div>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('Nuevo Laboratorio SQL', content));
};

/**
 * Envía notificación de práctica actualizada
 */
export const sendPracticeUpdatedEmail = async (studentEmail, studentName, practiceTitle, classroomName, deadline) => {
  const subject = `Recordatorio: ${practiceTitle} (Actualizado)`;
  const deadlineStr = deadline ? new Date(deadline).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'Sin límite de tiempo';
  
  const content = `
    <h2 style="margin-top: 0; color: #1e293b;">Hola, ${studentName || 'Estudiante'} 👋</h2>
    <p style="color: #475569; font-size: 16px;">Tu profesor ha <strong>modificado algunos detalles</strong> del laboratorio práctico en la clase <span class="highlight">${classroomName}</span>.</p>
    <div class="info-box">
      <p style="margin: 0; color: #1e293b; font-size: 16px;"><strong>Práctica:</strong> ${practiceTitle}</p>
      <p style="margin: 12px 0 0 0; color: #475569; font-size: 15px;"><strong>Vence:</strong> ${deadlineStr}</p>
    </div>
    <p style="color: #475569; font-size: 16px;">Te enviamos este recordatorio para que revises los cambios y te asegures de entregar a tiempo.</p>
    <div style="text-align: center; margin-top: 36px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Revisar Laboratorio</a>
    </div>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('Laboratorio Actualizado', content));
};

/**
 * Envía notificación de práctica calificada
 */
export const sendGradedEmail = async (studentEmail, studentName, practiceTitle, score, maxScore) => {
  const subject = `Práctica Calificada: ${practiceTitle}`;
  
  const content = `
    <h2>Hola, ${studentName || 'Estudiante'}</h2>
    <p>Tu profesor ha finalizado la revisión de tu práctica.</p>
    <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-size: 16px;"><strong>${practiceTitle}</strong></p>
      <h2 style="color: #4f46e5; font-size: 32px; margin: 10px 0;">${score} / ${maxScore}</h2>
    </div>
    <p>Puedes ingresar a Q-LIT para revisar los detalles de tu evaluación.</p>
    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Ver Calificación</a>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('Práctica Calificada', content));
};

/**
 * Envía notificación de recordatorio de vencimiento
 */
export const sendReminderEmail = async (studentEmail, studentName, practiceTitle, deadline) => {
  const subject = `⚠️ Recordatorio: Práctica por vencer`;
  const deadlineStr = new Date(deadline).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  
  const content = `
    <h2>Hola, ${studentName || 'Estudiante'}</h2>
    <p>Este es un recordatorio amigable de que tienes una práctica que <strong>vence mañana</strong>.</p>
    <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; color: #991b1b;"><strong>Práctica:</strong> ${practiceTitle}</p>
      <p style="margin: 8px 0 0 0; color: #991b1b;"><strong>Vence:</strong> ${deadlineStr}</p>
    </div>
    <p>Aún estás a tiempo de entregarla.</p>
    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Entregar Práctica</a>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('Práctica por Vencer', content));
};
