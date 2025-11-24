// Script para corregir la estructura de la tabla admins en la base de datos
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Corrigiendo estructura de tabla admins...\n');

  try {
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'migrations', 'fix_admin_email_to_username.sql');
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

    // Verificar resultado
    console.log('\n📊 Verificando estructura después de la corrección:');
    
    try {
      const admins = await prisma.$queryRaw`
        SELECT 
          id, 
          username, 
          role, 
          store_id,
          is_active
        FROM admins
        ORDER BY created_at DESC
        LIMIT 10
      `;

      console.table(admins);
      console.log(`\n✅ Corrección completada! Se encontraron ${Array.isArray(admins) ? admins.length : 0} admin(s).`);
      console.log('💡 Ahora puedes crear nuevos admins con username.');
    } catch (error) {
      console.error('⚠️  No se pudo verificar los admins:', error.message);
    }

  } catch (error) {
    console.error('❌ Error en la corrección:', error.message);
    console.log('\n💡 Alternativa: Ejecuta el contenido de server/migrations/fix_admin_email_to_username.sql');
    console.log('   directamente en Supabase SQL Editor.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

