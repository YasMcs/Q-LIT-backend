import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'q.lit.laboratorios@gmail.com';

  console.log(`Verificando si el administrador ${adminEmail} existe...`);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: 'admin',
      name: 'Q-LIT Admin'
    },
    create: {
      email: adminEmail,
      name: 'Q-LIT Admin',
      role: 'admin',
    },
  });

  console.log('✅ Cuenta de administrador lista en la base de datos:');
  console.log(`ID: ${user.id}`);
  console.log(`Email: ${user.email}`);
  console.log(`Rol: ${user.role}`);
}

main()
  .catch((e) => {
    console.error('❌ Error al crear el admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
