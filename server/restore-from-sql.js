import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function restoreFromSQL(sqlFilePath) {
  try {
    if (!fs.existsSync(sqlFilePath)) {
      console.error(`❌ El archivo ${sqlFilePath} no existe`);
      return;
    }

    console.log(`📥 Restaurando desde: ${sqlFilePath}\n`);
    console.log('⚠️ ADVERTENCIA: Esto sobrescribirá los datos actuales.');
    console.log('⚠️ Asegúrate de tener un backup antes de continuar.\n');

    // Extraer información de conexión de DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ DATABASE_URL no configurado');
      return;
    }

    // Parsear DATABASE_URL
    // Formato: postgresql://user:password@host:port/database
    const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    if (!urlMatch) {
      console.error('❌ DATABASE_URL no tiene el formato correcto');
      return;
    }

    const [, user, password, host, port, database] = urlMatch;

    console.log(`🔗 Conectando a: ${host}:${port}/${database}`);

    // Ejecutar psql para restaurar
    const env = { ...process.env, PGPASSWORD: password };
    const command = `psql -h ${host} -p ${port} -U ${user} -d ${database} -f ${sqlFilePath}`;

    console.log('⏳ Restaurando datos...');
    const { stdout, stderr } = await execAsync(command, { env });

    if (stderr && !stderr.includes('NOTICE')) {
      console.error('⚠️ Advertencias:', stderr);
    }

    console.log('✅ Restauración completada');
    console.log(stdout);

    // Verificar datos restaurados
    console.log('\n📊 Verificando datos restaurados:');
    const storesCount = await prisma.store.count();
    const productsCount = await prisma.product.count();
    const categoriesCount = await prisma.category.count();

    console.log(`   - Stores: ${storesCount}`);
    console.log(`   - Productos: ${productsCount}`);
    console.log(`   - Categorías: ${categoriesCount}`);

  } catch (error) {
    console.error('❌ Error restaurando datos:', error.message);
    console.error('\n💡 Alternativa: Restaura manualmente con:');
    console.error('   psql -h HOST -p PORT -U USER -d DATABASE -f backup.sql');
  } finally {
    await prisma.$disconnect();
  }
}

// Obtener ruta del archivo SQL desde argumentos
const sqlFilePath = process.argv[2];

if (!sqlFilePath) {
  console.log('📋 Uso: node restore-from-sql.js <ruta-al-archivo.sql>');
  console.log('\nEjemplo:');
  console.log('   node restore-from-sql.js backups/backup-2024-11-28.sql');
  process.exit(1);
}

restoreFromSQL(sqlFilePath);

