import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

// Cliente de Resend usando la API key del .env
const resend = new Resend(process.env.RESEND_API_KEY);

// Dirección remitente con dominio verificado en Resend
const SENDER_EMAIL = 'Q-LIT Notificaciones <noreply@q-lit.online>';

/**
 * Pausa la ejecución por `ms` milisegundos.
 * Se usa para respetar el rate limit de Resend (10 req/seg).
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Delay entre correos para no superar el rate limit de Resend (10/seg).
// Con 150 ms enviamos ~6 correos/seg, con margen de seguridad.
const EMAIL_SEND_DELAY_MS = 150;

// Iconos SVG reutilizables para el HTML del correo
const ICON = {
  star:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#6366f1" style="vertical-align:middle;margin-right:6px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  clock:   `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  file:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  grad:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#6366f1" style="vertical-align:middle;margin-right:6px;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  user:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  run:     `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
};

/**
 * Plantilla base para todos los correos
 */
const getBaseTemplate = (title, accentColor = '#6366f1', content) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #111827; line-height: 1.5; margin: 0; padding: 40px 20px; }
    .container { max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
    .header { background-color: ${accentColor}; padding: 28px 36px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em; }
    .header p { margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.75); }
    .body { padding: 32px 36px; }
    .footer { padding: 20px 36px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; }
    .footer p { margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.6; }
    .btn { display: inline-block; background-color: ${accentColor}; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; margin-top: 8px; }
    .highlight { font-weight: 600; color: #111827; }
    .info-box { background-color: #f9fafb; padding: 16px 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #e5e7eb; }
    .info-row { display: flex; align-items: center; margin: 0; color: #374151; font-size: 14px; padding: 4px 0; }
    .info-row + .info-row { margin-top: 10px; }
    .score-box { text-align: center; padding: 24px; }
    .score-num { font-size: 40px; font-weight: 800; color: ${accentColor}; line-height: 1; }
    .score-label { font-size: 13px; color: #6b7280; margin-top: 6px; }
    h2.greeting { margin: 0 0 16px; font-size: 17px; font-weight: 600; color: #111827; }
    p.body-text { color: #4b5563; font-size: 15px; margin: 0 0 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <p>Q-LIT Laboratorios SQL</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:12px;color:#92400e;font-size:12px;">
        Recomendamos acceder desde una <strong>computadora o laptop</strong>. La plataforma no esta optimizada para dispositivos moviles.
      </p>
      <p>Este es un mensaje automatico generado por Q-LIT. Por favor, no respondas a este correo.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Helper interno para enviar correo via Resend
 */
const sendEmail = async (to, subject, html) => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EMAIL] No se ha configurado RESEND_API_KEY en el .env. Correo simulado (no enviado a la red).');
    console.log(`[SIMULACION DE CORREO] Para: ${to} | Asunto: ${subject}`);
    return;
  }

  try {
    // Esperar antes de enviar para respetar el rate limit de Resend
    await sleep(EMAIL_SEND_DELAY_MS);

    const { data, error } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: [to],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error(`[EMAIL] Error enviando correo a ${to}:`, error);
      return;
    }

    console.log(`[EMAIL] Correo enviado a ${to} (ID: ${data.id})`);
    return data;
  } catch (error) {
    console.error(`[EMAIL] Error enviando correo a ${to}:`, error);
  }
};

/**
 * Envia notificacion de nueva practica
 */
export const sendNewPracticeEmail = async (studentEmail, studentName, practiceTitle, classroomName, deadline) => {
  const subject = `Nueva Practica Asignada: ${practiceTitle}`;
  const deadlineStr = deadline ? new Date(deadline).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' }) : 'Sin limite de tiempo';

  const content = `
    <h2 class="greeting">${ICON.user} Hola, ${studentName || 'Estudiante'}</h2>
    <p class="body-text">Tu profesor ha publicado un nuevo laboratorio practico en la clase <span class="highlight">${classroomName}</span>.</p>
    <div class="info-box">
      <p class="info-row">${ICON.file} <span><strong>Practica:</strong> ${practiceTitle}</span></p>
      <p class="info-row" style="margin-top:10px;">${ICON.clock} <span><strong>Vence:</strong> ${deadlineStr}</span></p>
    </div>
    <p class="body-text">Ingresa a Q-LIT para comenzar a resolverla y poner a prueba tu logica SQL.</p>
    <div style="margin-top: 28px;">
      <a href="${process.env.FRONTEND_URL || 'https://q-lit.online'}" class="btn">${ICON.run} Entrar al Laboratorio</a>
    </div>
  `;

  return sendEmail(studentEmail, subject, getBaseTemplate('Nueva Practica Asignada', '#6366f1', content));
};

/**
 * Envia notificacion de practica actualizada
 */
export const sendPracticeUpdatedEmail = async (studentEmail, studentName, practiceTitle, classroomName, deadline) => {
  const subject = `Practica Actualizada: ${practiceTitle}`;
  const deadlineStr = deadline ? new Date(deadline).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' }) : 'Sin limite de tiempo';

  const content = `
    <h2 class="greeting">${ICON.user} Hola, ${studentName || 'Estudiante'}</h2>
    <p class="body-text">Tu profesor ha <strong>modificado algunos detalles</strong> del laboratorio practico en la clase <span class="highlight">${classroomName}</span>.</p>
    <div class="info-box">
      <p class="info-row">${ICON.file} <span><strong>Practica:</strong> ${practiceTitle}</span></p>
      <p class="info-row" style="margin-top:10px;">${ICON.clock} <span><strong>Vence:</strong> ${deadlineStr}</span></p>
    </div>
    <p class="body-text">Te enviamos este recordatorio para que revises los cambios y te asegures de entregar a tiempo.</p>
    <div style="margin-top: 28px;">
      <a href="${process.env.FRONTEND_URL || 'https://q-lit.online'}" class="btn">${ICON.refresh} Revisar Laboratorio</a>
    </div>
  `;

  return sendEmail(studentEmail, subject, getBaseTemplate('Laboratorio Actualizado', '#6366f1', content));
};

/**
 * Envia notificacion de practica calificada
 */
export const sendGradedEmail = async (studentEmail, studentName, practiceTitle, score, maxScore) => {
  const subject = `Practica Calificada: ${practiceTitle}`;

  const content = `
    <h2 class="greeting">${ICON.user} Hola, ${studentName || 'Estudiante'}</h2>
    <p class="body-text">Tu profesor ha finalizado la revision de tu practica.</p>
    <div class="info-box">
      <div class="score-box">
        <p style="margin:0 0 8px; font-size:14px; color:#4b5563;">${ICON.file} <strong>${practiceTitle}</strong></p>
        <div class="score-num">${score} <span style="font-size:24px;color:#9ca3af;">/ ${maxScore}</span></div>
        <p class="score-label">Calificacion Final</p>
      </div>
    </div>
    <p class="body-text">Puedes ingresar a Q-LIT para revisar los detalles de tu evaluacion y retroalimentacion.</p>
    <div style="margin-top: 28px;">
      <a href="${process.env.FRONTEND_URL || 'https://q-lit.online'}" class="btn">${ICON.grad} Ver Calificacion</a>
    </div>
  `;

  return sendEmail(studentEmail, subject, getBaseTemplate('Practica Calificada', '#6366f1', content));
};

/**
 * Envia notificacion de recordatorio de vencimiento
 */
export const sendReminderEmail = async (studentEmail, studentName, practiceTitle, deadline) => {
  const subject = `Recordatorio: Practica por vencer`;
  const deadlineStr = new Date(deadline).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' });

  const content = `
    <h2 class="greeting">${ICON.user} Hola, ${studentName || 'Estudiante'}</h2>
    <p class="body-text">Este es un recordatorio de que tienes una practica que <strong>vence pronto</strong>.</p>
    <div class="info-box" style="border-left: 3px solid #ef4444;">
      <p class="info-row">${ICON.file} <span><strong>Practica:</strong> ${practiceTitle}</span></p>
      <p class="info-row" style="margin-top:10px;">${ICON.warning} <span style="color:#b91c1c;"><strong>Vence:</strong> ${deadlineStr}</span></p>
    </div>
    <p class="body-text">Aun estas a tiempo de entregarla y evitar penalizaciones.</p>
    <div style="margin-top: 28px;">
      <a href="${process.env.FRONTEND_URL || 'https://q-lit.online'}" class="btn" style="background-color:#ef4444;">${ICON.run} Entregar Practica</a>
    </div>
  `;

  return sendEmail(studentEmail, subject, getBaseTemplate('Practica por Vencer', '#ef4444', content));
};
