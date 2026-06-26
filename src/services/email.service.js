import { Resend } from 'resend';

// Inicializar Resend con la API key. Si no está en el .env, no fallará al instanciar, pero sí al enviar.
const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = 'Q-LIT Notificaciones <onboarding@resend.dev>';

/**
 * Plantilla base para todos los correos
 */
const getBaseTemplate = (title, content) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #0f172a; line-height: 1.6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .header { background-color: #4f46e5; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .content { padding: 32px; }
    .footer { text-align: center; padding: 24px; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; background-color: #f8fafc; }
    .btn { display: inline-block; background-color: #06b6d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 16px; }
    .highlight { color: #4f46e5; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      Este es un correo automático generado por Q-LIT.<br>Por favor, no respondas a este mensaje.
    </div>
  </div>
</body>
</html>
`;

/**
 * Helper interno para enviar correo
 */
const sendEmail = async (to, subject, html) => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ No se ha configurado RESEND_API_KEY. Correo no enviado.');
    return;
  }
  
  try {
    const data = await resend.emails.send({
      from: SENDER_EMAIL,
      to: [to],
      subject: subject,
      html: html
    });
    console.log(`✅ Correo enviado a ${to} (ID: ${data.id})`);
    return data;
  } catch (error) {
    console.error(`❌ Error enviando correo a ${to}:`, error);
    // No lanzamos error para que no bloquee el flujo principal de la app
  }
};

/**
 * Envía notificación de nueva práctica
 */
export const sendNewPracticeEmail = async (studentEmail, studentName, practiceTitle, classroomName, deadline) => {
  const subject = `Nueva Práctica Asignada: ${practiceTitle}`;
  const deadlineStr = deadline ? new Date(deadline).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }) : 'Sin límite de tiempo';
  
  const content = `
    <h2>Hola, ${studentName || 'Estudiante'}</h2>
    <p>Se ha asignado una nueva práctica en tu clase <span class="highlight">${classroomName}</span>.</p>
    <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0;"><strong>Práctica:</strong> ${practiceTitle}</p>
      <p style="margin: 8px 0 0 0;"><strong>Vence:</strong> ${deadlineStr}</p>
    </div>
    <p>Ingresa a Q-LIT para comenzar a resolverla lo antes posible.</p>
    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Ir a Q-LIT</a>
  `;
  
  return sendEmail(studentEmail, subject, getBaseTemplate('Nueva Práctica', content));
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
