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
  console.log('🔐 Crear Administrador\n');

  try {
    // Solicitar datos
    const email = await question('📧 Email del administrador: ');
    const password = await question('🔑 Contraseña (mínimo 6 caracteres): ');
    const role = await question('👤 Rol (admin/super_admin) [admin]: ') || 'admin';

    // Validaciones
    if (!email || !email.includes('@')) {
      console.error('❌ Email inválido');
      process.exit(1);
    }

    if (!password || password.length < 6) {
      console.error('❌ La contraseña debe tener al menos 6 caracteres');
      process.exit(1);
    }

    if (!['admin', 'super_admin'].includes(role)) {
      console.error('❌ Rol inválido. Debe ser "admin" o "super_admin"');
      process.exit(1);
    }

    // Verificar si ya existe
    const existing = await prisma.admin.findUnique({
      where: { email }
    });

    if (existing) {
      console.error(`❌ Ya existe un administrador con el email: ${email}`);
      process.exit(1);
    }

    // Crear hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear administrador
    const admin = await prisma.admin.create({
      data: {
        email,
        passwordHash,
        role,
        isActive: true
      }
    });

    console.log('\n✅ Administrador creado exitosamente!');
    console.log(`📧 Email: ${admin.email}`);
    console.log(`👤 Rol: ${admin.role}`);
    console.log(`🆔 ID: ${admin.id}`);
    console.log('\n💡 Ahora puedes iniciar sesión en el panel de administración con estas credenciales.');

  } catch (error) {
    console.error('❌ Error creando administrador:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();

