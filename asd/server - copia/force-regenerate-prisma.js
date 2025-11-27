// Script para forzar la regeneración completa de Prisma Client
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔄 Forzando regeneración completa de Prisma Client...\n');

// 1. Verificar schema
console.log('📋 Verificando schema...');
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

if (!schema.includes('username') || schema.includes('email String @unique')) {
  console.error('❌ Schema no tiene username correctamente. Verifica prisma/schema.prisma');
  process.exit(1);
}
console.log('✅ Schema correcto\n');

// 2. Limpiar completamente Prisma
console.log('🧹 Limpiando caché de Prisma...');
const pathsToClean = [
  path.join(__dirname, 'node_modules', '.prisma'),
  path.join(__dirname, 'node_modules', '@prisma', 'client'),
];

pathsToClean.forEach(p => {
  if (fs.existsSync(p)) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`✅ Limpiado: ${path.basename(p)}`);
    } catch (error) {
      console.log(`⚠️  No se pudo limpiar ${p}: ${error.message}`);
    }
  }
});

// 3. Regenerar Prisma Client
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

// 4. Verificar que Prisma Client reconoce username
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
    console.log('💡 Ejecuta la migración SQL: node fix-admin-db.js');
  }
  
  await prisma.$disconnect();
} catch (error) {
  console.error('❌ Error verificando:', error.message);
  if (error.message.includes('username')) {
    console.error('\n⚠️  Prisma Client AÚN no reconoce username.');
    console.error('💡 Intenta:');
    console.error('   1. rm -rf node_modules/@prisma');
    console.error('   2. npm install @prisma/client');
    console.error('   3. npx prisma generate');
  }
}

console.log('\n✅ Proceso completado!');
console.log('💡 Reinicia el backend: pm2 restart backend');

