import { PrismaClient } from '@prisma/client';
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
    
    // Dividir el SQL en statements (separados por ;)
    // Filtrar comentarios y líneas vacías
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
      .filter(s => !s.match(/^\s*$/));
    
    console.log(`📝 Encontrados ${statements.length} statements SQL`);
    
    // Ejecutar cada statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Saltar los bloques DO $$ que ya tienen su propio manejo
      if (statement.includes('DO $$')) {
        console.log(`⏭️  Saltando bloque DO (${i + 1}/${statements.length})`);
        continue;
      }
      
      try {
        // Ejecutar statement directamente
        if (statement.trim().length > 0) {
          await prisma.$executeRawUnsafe(statement);
          console.log(`✅ Statement ${i + 1}/${statements.length} ejecutado`);
        }
      } catch (error) {
        // Ignorar errores de "ya existe" o "no existe"
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist') ||
            error.message.includes('duplicate')) {
          console.log(`⚠️  Statement ${i + 1}/${statements.length} ya aplicado o no necesario`);
        } else {
          console.error(`❌ Error en statement ${i + 1}/${statements.length}:`, error.message);
          // Continuar con el siguiente
        }
      }
    }
    
    // Ejecutar los bloques DO $$ por separado
    const doBlocks = sql.match(/DO \$\$[\s\S]*?\$\$;/g) || [];
    for (let i = 0; i < doBlocks.length; i++) {
      try {
        await prisma.$executeRawUnsafe(doBlocks[i]);
        console.log(`✅ Bloque DO ${i + 1}/${doBlocks.length} ejecutado`);
      } catch (error) {
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist')) {
          console.log(`⚠️  Bloque DO ${i + 1}/${doBlocks.length} ya aplicado`);
        } else {
          console.error(`❌ Error en bloque DO ${i + 1}/${doBlocks.length}:`, error.message);
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

