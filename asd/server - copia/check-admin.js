// Script para verificar un admin
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2] || 'tomcorp';
  
  try {
    const admin = await prisma.admin.findUnique({
      where: { username },
      select: { 
        username: true, 
        role: true, 
        passwordHash: true, 
        isActive: true,
        storeId: true
      }
    });

    if (!admin) {
      console.log(`❌ Admin '${username}' no encontrado`);
      process.exit(1);
    }

    console.log('\n📊 Información del Admin:');
    console.log(`👤 Usuario: ${admin.username}`);
    console.log(`👤 Rol: ${admin.role}`);
    console.log(`🏪 Store ID: ${admin.storeId || 'null (superadmin)'}`);
    console.log(`✅ Activo: ${admin.isActive}`);
    console.log(`🔑 Tiene passwordHash: ${!!admin.passwordHash}`);
    console.log(`📏 Longitud del hash: ${admin.passwordHash?.length || 0}`);
    
    if (!admin.passwordHash) {
      console.log('\n⚠️  ADVERTENCIA: Este admin NO tiene passwordHash!');
      console.log('💡 Ejecuta: node reset-admin-password.js');
    } else if (admin.passwordHash.length < 50) {
      console.log('\n⚠️  ADVERTENCIA: El passwordHash parece inválido (muy corto)');
      console.log('💡 Ejecuta: node reset-admin-password.js');
    } else {
      console.log('\n✅ El admin tiene passwordHash válido');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

