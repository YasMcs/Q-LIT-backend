/**
 * Script de recordatorio manual masivo.
 * Envía un correo a todos los estudiantes con prácticas pendientes
 * (no entregadas y cuyo plazo aún no ha vencido o vence hoy).
 * 
 * Uso:
 *   node scripts/sendManualReminders.js
 */

import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

const SENDER_EMAIL = 'Q-LIT Notificaciones <noreply@q-lit.online>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://q-lit.online';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleString('es-MX', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Mexico_City',
      })
    : 'Sin fecha limite';

const buildEmailHtml = (studentName, practices) => {
  const practiceRows = practices
    .map((p) => {
      const isToday =
        p.deadline &&
        new Date(p.deadline).toDateString() === new Date().toDateString();
      const urgencyColor = isToday ? '#ef4444' : '#6366f1';
      const urgencyLabel = isToday
        ? '<strong style="color:#ef4444;">VENCE HOY</strong>'
        : formatDate(p.deadline);

      return `
        <tr>
          <td style="padding:10px 0; border-bottom:1px solid #f3f4f6;">
            <div style="font-weight:600; color:#111827; font-size:14px;">${p.practiceTitle}</div>
            <div style="font-size:12px; color:#6b7280; margin-top:2px;">${p.classroomName}</div>
          </td>
          <td style="padding:10px 0; border-bottom:1px solid #f3f4f6; text-align:right; font-size:13px; color:${urgencyColor};">
            ${urgencyLabel}
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f3f4f6; color:#111827; margin:0; padding:40px 20px; }
    .container { max-width:540px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 4px 24px rgba(0,0,0,0.06); }
    .header { background:#6366f1; padding:28px 36px; }
    .header h1 { margin:0; font-size:18px; font-weight:700; color:#fff; }
    .header p { margin:4px 0 0; font-size:13px; color:rgba(255,255,255,0.75); }
    .body { padding:32px 36px; }
    .footer { padding:20px 36px; background:#f9fafb; border-top:1px solid #f3f4f6; }
    .footer p { margin:0; color:#9ca3af; font-size:12px; }
    .btn { display:inline-block; background:#6366f1; color:#fff!important; padding:12px 24px; text-decoration:none; border-radius:10px; font-weight:600; font-size:14px; margin-top:16px; }
    table { width:100%; border-collapse:collapse; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Practicas Pendientes por Entregar</h1>
      <p>Q-LIT Laboratorios SQL</p>
    </div>
    <div class="body">
      <h2 style="margin:0 0 8px;font-size:17px;font-weight:600;">Hola, ${studentName || 'Estudiante'}</h2>
      <p style="color:#4b5563;font-size:15px;margin:0 0 20px;">
        Te recordamos que tienes las siguientes practicas de laboratorio SQL pendientes por entregar. Ingresa a Q-LIT para resolverlas antes de que venzan.
      </p>
      <table>
        <thead>
          <tr>
            <th style="text-align:left;font-size:12px;color:#9ca3af;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">PRACTICA</th>
            <th style="text-align:right;font-size:12px;color:#9ca3af;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">FECHA LIMITE</th>
          </tr>
        </thead>
        <tbody>
          ${practiceRows}
        </tbody>
      </table>
      <div style="margin-top:24px;">
        <a href="${FRONTEND_URL}" class="btn">Entrar al Laboratorio</a>
      </div>
    </div>
    <div class="footer">
      <p style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:12px;color:#92400e;font-size:12px;">
        Recomendamos acceder desde una <strong>computadora o laptop</strong>. La plataforma no esta optimizada para dispositivos moviles.
      </p>
      <p>Este es un mensaje automatico de Q-LIT. Por favor no respondas a este correo.</p>
    </div>
  </div>
</body>
</html>`;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log('Buscando practicas activas con estudiantes pendientes...\n');

  const now = new Date();

  // Buscar todas las prácticas que no han vencido aún (o que vencen hoy)
  const practices = await prisma.practice.findMany({
    where: {
      OR: [
        { deadline: null },
        { deadline: { gte: new Date(now.setHours(0, 0, 0, 0)) } },
      ],
    },
    include: {
      classroom: {
        include: {
          enrollments: {
            where: { role: 'student', isArchived: false },
            include: { user: true },
          },
        },
      },
      submissions: {
        select: { userId: true, reviewStatus: true },
      },
    },
  });

  console.log(`Se encontraron ${practices.length} practicas activas.\n`);

  // Agrupar prácticas pendientes por estudiante
  // Estructura: { userId -> { user, practices[] } }
  const pendingByStudent = new Map();

  for (const practice of practices) {
    for (const enrollment of practice.classroom.enrollments) {
      const student = enrollment.user;
      if (!student.email) continue;

      // Verificar si ya entregó (pendiente o calificada = ya entregó)
      const hasSubmitted = practice.submissions.some(
        (sub) =>
          sub.userId === student.id &&
          (sub.reviewStatus === 'pendiente' || sub.reviewStatus === 'calificada')
      );

      if (!hasSubmitted) {
        if (!pendingByStudent.has(student.id)) {
          pendingByStudent.set(student.id, { student, practices: [] });
        }
        pendingByStudent.get(student.id).practices.push({
          practiceTitle: practice.title,
          classroomName: practice.classroom.name,
          deadline: practice.deadline,
        });
      }
    }
  }

  const totalStudents = pendingByStudent.size;
  console.log(`Estudiantes con practicas pendientes: ${totalStudents}\n`);

  if (totalStudents === 0) {
    console.log('No hay estudiantes pendientes. No se enviaron correos.');
    return;
  }

  let sent = 0;
  let errors = 0;

  for (const [, { student, practices: pendingPractices }] of pendingByStudent) {
    try {
      const html = buildEmailHtml(student.name, pendingPractices);
      const { data, error } = await resend.emails.send({
        from: SENDER_EMAIL,
        to: [student.email],
        subject: `Tienes ${pendingPractices.length} practica(s) pendiente(s) en Q-LIT`,
        html,
      });

      if (error) {
        console.error(`  ERROR enviando a ${student.email}:`, error.message);
        errors++;
      } else {
        const practiceNames = pendingPractices.map((p) => p.practiceTitle).join(', ');
        console.log(`  Enviado a ${student.email} (${student.name}) - Practicas: ${practiceNames}`);
        sent++;
      }

      // Pequeña pausa para no saturar la API (10 correos/seg máximo en plan free)
      await new Promise((r) => setTimeout(r, 120));
    } catch (err) {
      console.error(`  EXCEPCION enviando a ${student.email}:`, err.message);
      errors++;
    }
  }

  console.log(`\nResumen: ${sent} correos enviados, ${errors} errores.`);
};

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
