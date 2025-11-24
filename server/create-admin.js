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
    const username = await question('👤 Usuario del administrador: ');
    const password = await question('🔑 Contraseña (mínimo 6 caracteres): ');
    const role = await question('👤 Rol (admin/super_admin) [admin]: ') || 'admin';
    
    let storeId = null;
    if (role === 'admin') {
      const storeIdInput = await question('🏪 Store ID (ID del local asignado, dejar vacío si no hay): ');
      storeId = storeIdInput.trim() || null;
      
      // Si se proporcionó un storeId, verificar que existe
      if (storeId) {
        const store = await prisma.store.findUnique({
          where: { id: storeId }
        });
        
        if (!store) {
          console.error(`❌ No existe un store con ID: ${storeId}`);
          console.log('💡 Stores disponibles:');
          const stores = await prisma.store.findMany({
            where: { isActive: true },
            select: { id: true, name: true }
          });
          stores.forEach(s => console.log(`   - ${s.id}: ${s.name}`));
          process.exit(1);
        }
      }
    }

    // Validaciones
    if (!username || username.trim().length === 0) {
      console.error('❌ Usuario inválido');
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
      where: { username: username.trim() }
    });

    if (existing) {
      console.error(`❌ Ya existe un administrador con el usuario: ${username}`);
      process.exit(1);
    }

    // Crear hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear administrador
    const admin = await prisma.admin.create({
      data: {
        username: username.trim(),
        passwordHash,
        role,
        storeId: storeId || null, // null para super_admin, storeId para admin
        isActive: true
      }
    });

    console.log('\n✅ Administrador creado exitosamente!');
    console.log(`👤 Usuario: ${admin.username}`);
    console.log(`👤 Rol: ${admin.role}`);
    console.log(`🆔 ID: ${admin.id}`);
    if (admin.storeId) {
      const store = await prisma.store.findUnique({
        where: { id: admin.storeId },
        select: { name: true }
      });
      console.log(`🏪 Store asignado: ${store?.name || admin.storeId}`);
    } else {
      console.log(`🏪 Store asignado: Ninguno (Superadmin)`);
    }
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

