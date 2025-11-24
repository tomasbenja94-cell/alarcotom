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
    
    // PASO 1: Crear la tabla stores PRIMERO (antes de los bloques DO)
    console.log('📋 Paso 1: Creando tabla stores...');
    const createTableSQL = `CREATE TABLE IF NOT EXISTS "stores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "image_url" TEXT,
    "description" TEXT,
    "hours" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);`;
    
    try {
      await prisma.$executeRawUnsafe(createTableSQL);
      console.log('✅ Tabla stores creada o ya existe');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠️  Tabla stores ya existe');
      } else {
        console.error('❌ Error creando tabla stores:', error.message);
        throw error;
      }
    }
    
    // PASO 2: Ejecutar los bloques DO $$ para agregar columnas store_id
    const doBlocks = sql.match(/DO \$\$[\s\S]*?\$\$;/g) || [];
    console.log(`📝 Paso 2: Encontrados ${doBlocks.length} bloques DO $$ para agregar columnas store_id`);
    
    for (let i = 0; i < doBlocks.length; i++) {
      try {
        console.log(`🔄 Ejecutando bloque DO ${i + 1}/${doBlocks.length}...`);
        await prisma.$executeRawUnsafe(doBlocks[i]);
        console.log(`✅ Bloque DO ${i + 1}/${doBlocks.length} ejecutado`);
      } catch (error) {
        // Los bloques DO verifican si la columna existe, así que si falla puede ser porque ya existe
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist') ||
            error.message.includes('duplicate') ||
            error.message.includes('column') && error.message.includes('already exists')) {
          console.log(`⚠️  Bloque DO ${i + 1}/${doBlocks.length} ya aplicado o no necesario`);
        } else {
          console.error(`❌ Error en bloque DO ${i + 1}/${doBlocks.length}:`, error.message);
          // Mostrar más detalles del error
          console.error(`   Error completo:`, error);
          // Continuar con el siguiente
        }
      }
    }
    
    console.log('✅ Migración completada!');
    
    // Verificar que la tabla stores existe
    try {
      const result = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM stores');
      console.log('✅ Verificación: Tabla stores existe y es accesible');
    } catch (error) {
      console.error('❌ Error verificando tabla stores:', error.message);
    }
    
    // Verificar que las columnas store_id se crearon
    console.log('🔍 Verificando columnas store_id...');
    const tablesToCheck = [
      'categories', 'products', 'orders', 'pending_transfers', 'admins',
      'bot_messages', 'system_states', 'daily_checklist_tasks', 'system_notifications',
      'ai_recommendations', 'daily_closures', 'peak_demand_modes', 'product_labels',
      'business_expenses', 'daily_cost_analyses', 'special_hours'
    ];
    
    for (const table of tablesToCheck) {
      try {
        const result = await prisma.$queryRawUnsafe(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${table}' AND column_name = 'store_id'
        `);
        if (Array.isArray(result) && result.length > 0) {
          console.log(`✅ Columna store_id existe en ${table}`);
        } else {
          console.log(`⚠️  Columna store_id NO existe en ${table}`);
        }
      } catch (error) {
        console.error(`❌ Error verificando ${table}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();

