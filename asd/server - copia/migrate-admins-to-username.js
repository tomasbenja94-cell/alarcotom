// Script para migrar admins de email a username
// Ejecutar: node server/migrate-admins-to-username.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Migrando admins de email a username...\n');

  try {
    // Verificar si hay una columna email en la tabla admins
    const admins = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'admins' AND column_name = 'email'
    `;

    if (admins.length === 0) {
      console.log('✅ La tabla admins ya usa username. No hay migración necesaria.');
      return;
    }

    // Obtener todos los admins que tienen email pero no username
    const adminsWithEmail = await prisma.$queryRaw`
      SELECT id, email, username 
      FROM admins 
      WHERE email IS NOT NULL AND (username IS NULL OR username = '')
    `;

    if (adminsWithEmail.length === 0) {
      console.log('✅ Todos los admins ya tienen username. No hay migración necesaria.');
      return;
    }

    console.log(`📋 Encontrados ${adminsWithEmail.length} admin(s) para migrar:\n`);

    for (const admin of adminsWithEmail) {
      // Generar username desde email (parte antes del @)
      const username = admin.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
      
      console.log(`  - Migrando: ${admin.email} → ${username}`);

      try {
        // Verificar si el username ya existe
        const existing = await prisma.admin.findUnique({
          where: { username }
        });

        if (existing && existing.id !== admin.id) {
          // Si existe, agregar un número
          let newUsername = `${username}_${Date.now().toString().slice(-4)}`;
          console.log(`    ⚠️  Username ${username} ya existe, usando: ${newUsername}`);
          
          await prisma.$executeRaw`
            UPDATE admins 
            SET username = ${newUsername}
            WHERE id = ${admin.id}
          `;
        } else {
          await prisma.$executeRaw`
            UPDATE admins 
            SET username = ${username}
            WHERE id = ${admin.id}
          `;
        }

        console.log(`    ✅ Migrado exitosamente`);
      } catch (error) {
        console.error(`    ❌ Error migrando ${admin.email}:`, error.message);
      }
    }

    console.log('\n✅ Migración completada!');
    console.log('💡 Ahora puedes eliminar la columna email de la tabla admins si lo deseas.');

  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

