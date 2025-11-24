import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('🔄 Ejecutando migración de stores...');
    
    // Leer el archivo SQL
    const sqlFile = path.join(__dirname, '..', 'create_stores_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');
    
    // Primero extraer y ejecutar los bloques DO $$
    const doBlocks = sql.match(/DO \$\$[\s\S]*?\$\$;/g) || [];
    console.log(`📝 Encontrados ${doBlocks.length} bloques DO $$`);
    
    for (let i = 0; i < doBlocks.length; i++) {
      try {
        console.log(`🔄 Ejecutando bloque DO ${i + 1}/${doBlocks.length}...`);
        await prisma.$executeRawUnsafe(doBlocks[i]);
        console.log(`✅ Bloque DO ${i + 1}/${doBlocks.length} ejecutado`);
      } catch (error) {
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist') ||
            error.message.includes('duplicate')) {
          console.log(`⚠️  Bloque DO ${i + 1}/${doBlocks.length} ya aplicado o no necesario`);
        } else {
          console.error(`❌ Error en bloque DO ${i + 1}/${doBlocks.length}:`, error.message);
          // Continuar con el siguiente
        }
      }
    }
    
    // Luego ejecutar los statements simples (CREATE TABLE)
    // Remover los bloques DO $$ del SQL antes de dividir
    let sqlWithoutDo = sql;
    doBlocks.forEach(block => {
      sqlWithoutDo = sqlWithoutDo.replace(block, '');
    });
    
    // Dividir el SQL restante en statements
    const statements = sqlWithoutDo
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
      .filter(s => !s.match(/^\s*$/))
      .filter(s => s.length > 10); // Filtrar statements muy cortos (probablemente vacíos)
    
    console.log(`📝 Encontrados ${statements.length} statements SQL simples`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      try {
        if (statement.trim().length > 0) {
          console.log(`🔄 Ejecutando statement ${i + 1}/${statements.length}...`);
          await prisma.$executeRawUnsafe(statement + ';');
          console.log(`✅ Statement ${i + 1}/${statements.length} ejecutado`);
        }
      } catch (error) {
        // Ignorar errores de "ya existe" o "no existe"
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist') ||
            error.message.includes('duplicate') ||
            error.message.includes('relation') && error.message.includes('already exists')) {
          console.log(`⚠️  Statement ${i + 1}/${statements.length} ya aplicado o no necesario`);
        } else {
          console.error(`❌ Error en statement ${i + 1}/${statements.length}:`, error.message);
          console.error(`   Statement: ${statement.substring(0, 100)}...`);
          // Continuar con el siguiente
        }
      }
    }
    
    console.log('✅ Migración completada!');
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();

