// Script simplificado para ejecutar la migración de username en admins
// Ejecutar: node run-username-migration-simple.js

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Ejecutando migración simplificada de username en admins...\n');

  try {
    // Leer el archivo SQL completo
    const sqlPath = path.join(__dirname, 'migrations', 'add_username_to_admins_simple.sql');
    let sql = fs.readFileSync(sqlPath, 'utf-8');

    // Remover comentarios de una línea
    sql = sql.replace(/^--.*$/gm, '');

    // Dividir en bloques completos (respetando DO $$ ... END $$)
    const blocks = [];
    let currentBlock = '';
    let inDoBlock = false;

    const lines = sql.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;

      // Detectar inicio de bloque DO
      if (line.startsWith('DO $$')) {
        inDoBlock = true;
        currentBlock = line;
        continue;
      }

      // Si estamos en un bloque DO, acumular hasta END $$
      if (inDoBlock) {
        currentBlock += '\n' + line;
        
        // Detectar el final del bloque DO
        if (line.includes('END $$;')) {
          blocks.push(currentBlock);
          currentBlock = '';
          inDoBlock = false;
        }
        continue;
      }

      // Si la línea termina con ;, es un statement completo
      if (line.endsWith(';')) {
        currentBlock += (currentBlock ? '\n' : '') + line;
        blocks.push(currentBlock);
        currentBlock = '';
      } else {
        currentBlock += (currentBlock ? '\n' : '') + line;
      }
    }

    // Agregar el último bloque si existe
    if (currentBlock.trim()) {
      blocks.push(currentBlock);
    }

    console.log(`📋 Ejecutando ${blocks.length} bloque(s) SQL...\n`);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      
      if (!block || block.length < 5) {
        continue;
      }

      try {
        // Ejecutar bloque completo
        await prisma.$executeRawUnsafe(block);
        console.log(`✅ Bloque ${i + 1}/${blocks.length} ejecutado correctamente`);
      } catch (error) {
        // Algunos errores son esperados (como "ya existe")
        const errorMsg = error.message || '';
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('ya existe') ||
            errorMsg.includes('does not exist') ||
            errorMsg.includes('no existe') ||
            errorMsg.includes('duplicate key') ||
            errorMsg.includes('constraint') ||
            errorMsg.includes('column') && errorMsg.includes('already')) {
          console.log(`⚠️  Bloque ${i + 1}/${blocks.length}: ${errorMsg.split('\n')[0].substring(0, 80)}...`);
        } else {
          console.error(`❌ Error en bloque ${i + 1}/${blocks.length}:`, errorMsg.split('\n')[0]);
          // Continuar con el siguiente bloque
        }
      }
    }

    // Verificar resultado usando Prisma (no raw query)
    console.log('\n📊 Verificando admins después de la migración:');
    
    try {
      const admins = await prisma.admin.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          storeId: true,
          isActive: true
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 10
      });

      console.table(admins);
      console.log(`\n✅ Migración completada! Se encontraron ${admins.length} admin(s).`);
      console.log('💡 Ahora puedes usar username para login en lugar de email.');
    } catch (error) {
      if (error.message.includes('column "username" does not exist')) {
        console.error('❌ La columna username aún no existe en la base de datos.');
        console.log('\n💡 Ejecuta el SQL directamente en Supabase SQL Editor:');
        console.log('   server/migrations/add_username_to_admins_simple.sql');
      } else {
        console.error('⚠️  No se pudo verificar los admins:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ Error en la migración:', error.message);
    console.log('\n💡 Alternativa: Ejecuta el contenido de server/migrations/add_username_to_admins_simple.sql');
    console.log('   directamente en Supabase SQL Editor.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

