import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function recoverData() {
  try {
    console.log('🔍 Buscando backups y datos para recuperar...\n');

    // 1. Verificar si hay backups de Prisma
    const migrationsDir = path.join(__dirname, 'prisma', 'migrations');
    console.log('📁 Verificando migraciones en:', migrationsDir);
    
    if (fs.existsSync(migrationsDir)) {
      const migrations = fs.readdirSync(migrationsDir);
      console.log(`   - Encontradas ${migrations.length} migraciones`);
    }

    // 2. Verificar si hay archivos SQL de backup
    const backupDirs = [
      path.join(__dirname, 'backups'),
      path.join(__dirname, '..', 'backups'),
      '/var/backups/postgresql',
      '/opt/elbuenmenu/backups'
    ];

    console.log('\n💾 Buscando backups en:');
    for (const backupDir of backupDirs) {
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir);
        const sqlFiles = files.filter(f => f.endsWith('.sql') || f.endsWith('.dump'));
        if (sqlFiles.length > 0) {
          console.log(`   ✅ ${backupDir}: ${sqlFiles.length} archivos de backup encontrados`);
          sqlFiles.forEach(file => {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);
            console.log(`      - ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB, modificado: ${stats.mtime.toLocaleString()})`);
          });
        }
      }
    }

    // 3. Verificar estado actual de la base de datos
    console.log('\n📊 Estado actual de la base de datos:');
    
    const storesCount = await prisma.store.count();
    const productsCount = await prisma.product.count();
    const categoriesCount = await prisma.category.count();
    const ordersCount = await prisma.order.count();

    console.log(`   - Stores: ${storesCount}`);
    console.log(`   - Productos: ${productsCount}`);
    console.log(`   - Categorías: ${categoriesCount}`);
    console.log(`   - Pedidos: ${ordersCount}`);

    // 4. Verificar si hay datos en tablas de auditoría o logs
    try {
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: { contains: 'delete' }
        },
        orderBy: { timestamp: 'desc' },
        take: 10
      });

      if (auditLogs.length > 0) {
        console.log('\n⚠️ Se encontraron registros de eliminación en logs de auditoría:');
        auditLogs.forEach(log => {
          console.log(`   - ${log.action} el ${log.timestamp.toLocaleString()}`);
        });
      }
    } catch (error) {
      // La tabla puede no existir
    }

    // 5. Verificar conexión a la base de datos
    console.log('\n🔗 Información de conexión:');
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      // Ocultar credenciales
      const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
      console.log(`   - DATABASE_URL: ${maskedUrl}`);
    } else {
      console.log('   ⚠️ DATABASE_URL no configurado');
    }

    // 6. Instrucciones de recuperación
    console.log('\n📋 Opciones de recuperación:');
    console.log('   1. Si usas Supabase:');
    console.log('      - Ve al dashboard de Supabase');
    console.log('      - Database → Backups');
    console.log('      - Restaura desde el backup más reciente');
    console.log('');
    console.log('   2. Si usas PostgreSQL directo:');
    console.log('      - Busca backups en /var/backups/postgresql/');
    console.log('      - O ejecuta: pg_restore -d tu_base_de_datos backup.dump');
    console.log('');
    console.log('   3. Si tienes un dump SQL:');
    console.log('      - psql -d tu_base_de_datos -f backup.sql');

  } catch (error) {
    console.error('❌ Error verificando datos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

recoverData();

