import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSupabaseBackups() {
  try {
    console.log('🔍 Verificando opciones de recuperación en Supabase...\n');

    // Verificar todas las tablas que existen
    console.log('📋 Verificando tablas en la base de datos:');
    
    // Intentar consultar directamente con SQL raw para ver todas las tablas
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    console.log(`   - Encontradas ${tables.length} tablas:`);
    tables.forEach((table: any) => {
      console.log(`     • ${table.table_name}`);
    });

    // Verificar si hay datos en tablas de sistema que puedan tener información
    console.log('\n🔍 Verificando tablas que puedan tener datos históricos:');
    
    const systemTables = [
      'audit_logs',
      'driver_balance_transactions',
      'orders',
      'order_items',
      'customers',
      'delivery_persons',
      'admins'
    ];

    for (const tableName of systemTables) {
      try {
        const count = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) as count FROM ${tableName}`
        );
        const countNum = (count as any[])[0]?.count || 0;
        if (countNum > 0) {
          console.log(`   ✅ ${tableName}: ${countNum} registros`);
        }
      } catch (error) {
        // La tabla puede no existir
      }
    }

    console.log('\n📋 INSTRUCCIONES PARA RECUPERAR DESDE SUPABASE:');
    console.log('');
    console.log('1. Ve a: https://supabase.com/dashboard');
    console.log('2. Selecciona tu proyecto');
    console.log('3. Ve a: Database → Backups');
    console.log('4. Busca el backup más reciente ANTES de regenerar Prisma');
    console.log('5. Haz clic en "Restore" o "Restore to this point"');
    console.log('');
    console.log('⚠️ IMPORTANTE:');
    console.log('   - Los backups de Supabase son automáticos');
    console.log('   - Puedes restaurar a cualquier punto en el tiempo');
    console.log('   - Esto sobrescribirá los datos actuales');
    console.log('');
    console.log('💡 Si no encuentras backups en Supabase:');
    console.log('   - Ve a Database → Point-in-time Recovery');
    console.log('   - Selecciona una fecha/hora antes del borrado');
    console.log('   - Restaura desde ese punto');

  } catch (error) {
    console.error('❌ Error verificando:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSupabaseBackups();

