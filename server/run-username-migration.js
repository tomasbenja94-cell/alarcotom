// Script para ejecutar la migración de username en admins
// Ejecutar: node server/run-username-migration.js

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Ejecutando migración de username en admins...\n');

  try {
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'migrations', 'add_username_to_admins.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Dividir en statements (separados por ;)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📋 Ejecutando ${statements.length} statement(s)...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Saltar comentarios y bloques DO
      if (statement.startsWith('--') || statement.length < 10) {
        continue;
      }

      try {
        // Ejecutar statement
        await prisma.$executeRawUnsafe(statement);
        console.log(`✅ Statement ${i + 1} ejecutado`);
      } catch (error) {
        // Algunos errores son esperados (como "ya existe")
        if (error.message.includes('already exists') || 
            error.message.includes('ya existe') ||
            error.message.includes('does not exist') ||
            error.message.includes('no existe')) {
          console.log(`⚠️  Statement ${i + 1}: ${error.message.split('\n')[0]}`);
        } else {
          console.error(`❌ Error en statement ${i + 1}:`, error.message);
          // Continuar con el siguiente statement
        }
      }
    }

    // Verificar resultado
    console.log('\n📊 Verificando admins después de la migración:');
    const admins = await prisma.$queryRaw`
      SELECT id, username, role, store_id, is_active
      FROM admins
      ORDER BY created_at DESC
      LIMIT 10
    `;

    console.table(admins);

    console.log('\n✅ Migración completada!');
    console.log('💡 Ahora puedes usar username para login en lugar de email.');

  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

