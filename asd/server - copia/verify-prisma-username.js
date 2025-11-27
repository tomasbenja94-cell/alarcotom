// Script para verificar que Prisma Client reconoce username
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando que Prisma Client reconoce username...\n');

  try {
    // Intentar hacer una query con username
    const admin = await prisma.admin.findUnique({
      where: { username: 'tomcorp' }
    });

    if (admin) {
      console.log('✅ Prisma Client reconoce username correctamente!');
      console.log(`✅ Admin encontrado: ${admin.username} (${admin.role})`);
    } else {
      console.log('⚠️  Admin no encontrado, pero Prisma Client reconoce username');
    }
  } catch (error) {
    if (error.message.includes('Unknown argument `username`')) {
      console.error('❌ Prisma Client NO reconoce username');
      console.error('💡 El Prisma Client generado todavía tiene el schema antiguo');
      console.error('\nSolución:');
      console.error('1. Verifica que prisma/schema.prisma tenga username (no email)');
      console.error('2. rm -rf node_modules/.prisma node_modules/@prisma/client');
      console.error('3. npx prisma generate');
      console.error('4. pm2 restart backend');
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();

