// Script para verificar y corregir Prisma Client con username
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Verificando schema de Prisma...\n');

// Leer el schema
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

// Verificar si tiene username
if (schema.includes('username') && schema.includes('@unique')) {
  console.log('✅ Schema tiene username correctamente definido');
} else {
  console.error('❌ Schema NO tiene username. Verifica el archivo schema.prisma');
  process.exit(1);
}

// Verificar si todavía tiene email en el modelo Admin
if (schema.match(/model Admin[\s\S]*?email[\s\S]*?String/)) {
  console.error('❌ Schema todavía tiene campo email en Admin. Debe ser username.');
  process.exit(1);
}

console.log('✅ Schema correcto\n');

// Limpiar caché de Prisma
console.log('🧹 Limpiando caché de Prisma...');
try {
  const prismaCachePath = path.join(__dirname, 'node_modules', '.prisma');
  if (fs.existsSync(prismaCachePath)) {
    fs.rmSync(prismaCachePath, { recursive: true, force: true });
    console.log('✅ Caché de Prisma limpiada');
  }
} catch (error) {
  console.log('⚠️  No se pudo limpiar caché (puede que no exista)');
}

// Regenerar Prisma Client
console.log('\n🔄 Regenerando Prisma Client...');
try {
  execSync('npx prisma generate', { 
    cwd: __dirname, 
    stdio: 'inherit',
    env: { ...process.env }
  });
  console.log('\n✅ Prisma Client regenerado correctamente');
} catch (error) {
  console.error('\n❌ Error regenerando Prisma Client');
  process.exit(1);
}

// Verificar que Prisma Client reconoce username
console.log('\n🔍 Verificando que Prisma Client reconoce username...');
try {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  // Intentar hacer una query que use username
  const testQuery = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'admins' AND column_name = 'username'
  `;
  
  if (Array.isArray(testQuery) && testQuery.length > 0) {
    console.log('✅ Prisma Client reconoce username correctamente');
    console.log('✅ La columna username existe en la base de datos');
  } else {
    console.error('❌ La columna username NO existe en la base de datos');
    console.log('💡 Ejecuta la migración SQL: node run-username-migration-simple.js');
  }
  
  await prisma.$disconnect();
} catch (error) {
  console.error('❌ Error verificando:', error.message);
}

console.log('\n✅ Proceso completado!');

