// Script simplificado para crear solo superadmins
// Ejecutar: node create-superadmin.js

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
  console.log('🔐 Crear Super Administrador\n');
  console.log('ℹ️  Los superadmins tienen acceso a todos los stores y pueden crear nuevos stores.\n');

  try {
    // Solicitar datos
    const username = await question('👤 Usuario del superadmin: ');
    const password = await question('🔑 Contraseña (mínimo 6 caracteres): ');

    // Validaciones
    if (!username || username.trim().length === 0) {
      console.error('❌ Usuario inválido');
      process.exit(1);
    }

    if (!password || password.length < 6) {
      console.error('❌ La contraseña debe tener al menos 6 caracteres');
      process.exit(1);
    }

    // Verificar si ya existe
    const existing = await prisma.admin.findUnique({
      where: { username: username.trim() }
    });

    if (existing) {
      console.error(`❌ Ya existe un administrador con el usuario: ${username}`);
      if (existing.role === 'super_admin') {
        console.log('💡 Este usuario ya es un superadmin.');
      }
      process.exit(1);
    }

    // Crear hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear superadmin (SIEMPRE sin store asignado)
    const admin = await prisma.admin.create({
      data: {
        username: username.trim(),
        passwordHash,
        role: 'super_admin',
        storeId: null, // Superadmin NUNCA tiene store asignado
        isActive: true
      }
    });

    console.log('\n✅ Super Administrador creado exitosamente!');
    console.log('─'.repeat(60));
    console.log(`👤 Usuario: ${admin.username}`);
    console.log(`👤 Rol: ${admin.role}`);
    console.log(`🆔 ID: ${admin.id}`);
    console.log(`🏪 Store asignado: Ninguno (Superadmin tiene acceso a todos)`);
    console.log(`✅ Estado: Activo`);
    console.log('─'.repeat(60));
    console.log('\n💡 Ahora puedes iniciar sesión en /superadmin con estas credenciales.');
    console.log(`🔗 URL: https://elbuenmenu.site/superadmin`);

  } catch (error) {
    console.error('❌ Error creando superadmin:', error.message);
    if (error.code === 'P2002') {
      console.error('💡 El usuario ya existe. Usa otro nombre de usuario.');
    }
    process.exit(1);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main();

