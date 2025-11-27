// Script para resetear la contraseña de un admin
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🔐 Resetear Contraseña de Administrador\n');

  try {
    // Solicitar datos
    const username = await question('👤 Usuario del administrador: ');
    const newPassword = await question('🔑 Nueva contraseña (mínimo 6 caracteres): ');

    // Validaciones
    if (!username || username.trim().length === 0) {
      console.error('❌ Usuario inválido');
      process.exit(1);
    }

    if (!newPassword || newPassword.length < 6) {
      console.error('❌ La contraseña debe tener al menos 6 caracteres');
      process.exit(1);
    }

    // Buscar admin
    const admin = await prisma.admin.findUnique({
      where: { username: username.trim() }
    });

    if (!admin) {
      console.error(`❌ No existe un administrador con el usuario: ${username}`);
      process.exit(1);
    }

    // Crear hash de nueva contraseña
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash }
    });

    console.log('\n✅ Contraseña actualizada exitosamente!');
    console.log(`👤 Usuario: ${admin.username}`);
    console.log(`👤 Rol: ${admin.role}`);
    console.log(`🆔 ID: ${admin.id}`);
    console.log('\n💡 Ahora puedes iniciar sesión con la nueva contraseña.');

  } catch (error) {
    console.error('❌ Error actualizando contraseña:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();

