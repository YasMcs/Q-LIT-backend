import { sendNewPracticeEmail } from '../src/services/email.service.js';
import dotenv from 'dotenv';
dotenv.config();

const recipient = process.argv[2] || process.env.EMAIL_USER;

if (!recipient) {
  console.error('❌ Por favor especifica un correo de destino o configura EMAIL_USER en el .env');
  process.exit(1);
}

console.log(`📤 Enviando correo de prueba a: ${recipient}...`);

try {
  await sendNewPracticeEmail(
    recipient,
    'Usuario de Prueba',
    'Práctica de Prueba de Notificaciones',
    'Clase de Base de Datos I',
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  console.log('✅ Proceso de envío finalizado. Revisa los logs de arriba para confirmar si se envió correctamente o si arrojó algún error.');
} catch (error) {
  console.error('❌ Error ejecutando el test:', error);
}
