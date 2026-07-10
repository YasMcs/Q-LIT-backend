import { sendNewPracticeEmail } from '../src/services/email.service.js';
import dotenv from 'dotenv';
dotenv.config();

const recipient = process.argv[2] || 'q.lit.laboratorios@gmail.com';

console.log(`Enviando correo de prueba a: ${recipient}...`);

try {
  await sendNewPracticeEmail(
    recipient,
    'Usuario de Prueba',
    'Practica de Prueba de Notificaciones',
    'Clase de Base de Datos I',
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  console.log('Proceso de envio finalizado. Revisa los logs de arriba.');
} catch (error) {
  console.error('Error ejecutando el test:', error);
}
