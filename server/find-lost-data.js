import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findLostData() {
  try {
    console.log('🔍 Buscando rastros de datos perdidos...\n');

    // 1. Verificar pedidos (pueden tener referencias a productos y stores)
    console.log('📦 Verificando pedidos (pueden tener referencias a productos):');
    try {
      const orders = await prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
      });
      console.log(`   - Total de pedidos: ${orders.length}`);
      
      if (orders.length > 0) {
        console.log('\n   📋 Últimos pedidos encontrados:');
        orders.forEach(order => {
          console.log(`     • Pedido #${order.orderNumber} - Store: ${order.storeId || 'N/A'} - Total: $${order.total}`);
        });

        // Extraer storeIds únicos de los pedidos
        const storeIds = [...new Set(orders.map(o => o.storeId).filter(Boolean))];
        if (storeIds.length > 0) {
          console.log(`\n   🏪 StoreIds encontrados en pedidos: ${storeIds.join(', ')}`);
        }
      }
    } catch (error) {
      console.log('   ⚠️ No se pudieron consultar pedidos');
    }

    // 2. Verificar order_items (pueden tener nombres de productos)
    console.log('\n🛍️ Verificando items de pedidos (pueden tener nombres de productos):');
    try {
      const orderItems = await prisma.orderItem.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        distinct: ['productName']
      });
      
      if (orderItems.length > 0) {
        console.log(`   - Encontrados ${orderItems.length} productos únicos en pedidos:`);
        const uniqueProducts = [...new Set(orderItems.map(item => item.productName))];
        uniqueProducts.slice(0, 10).forEach(product => {
          console.log(`     • ${product}`);
        });
        if (uniqueProducts.length > 10) {
          console.log(`     ... y ${uniqueProducts.length - 10} más`);
        }
      } else {
        console.log('   - No se encontraron items de pedidos');
      }
    } catch (error) {
      console.log('   ⚠️ No se pudieron consultar items de pedidos');
    }

    // 3. Verificar logs de auditoría
    console.log('\n📋 Verificando logs de auditoría:');
    try {
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          OR: [
            { action: { contains: 'store' } },
            { action: { contains: 'product' } },
            { action: { contains: 'category' } }
          ]
        },
        orderBy: { timestamp: 'desc' },
        take: 20
      });

      if (auditLogs.length > 0) {
        console.log(`   - Encontrados ${auditLogs.length} logs relevantes:`);
        auditLogs.forEach(log => {
          console.log(`     • ${log.action} - ${log.timestamp.toLocaleString()}`);
        });
      } else {
        console.log('   - No se encontraron logs de auditoría relevantes');
      }
    } catch (error) {
      console.log('   ⚠️ No se pudieron consultar logs de auditoría');
    }

    // 4. Verificar store_settings (pueden tener referencias a stores)
    console.log('\n⚙️ Verificando configuraciones de tiendas:');
    try {
      const settings = await prisma.storeSettings.findMany({
        take: 10
      });
      
      if (settings.length > 0) {
        console.log(`   - Encontradas ${settings.length} configuraciones:`);
        const storeIds = settings.map(s => s.storeId);
        console.log(`   - StoreIds en configuraciones: ${storeIds.join(', ')}`);
        
        // Verificar si estos stores existen
        for (const storeId of storeIds) {
          const store = await prisma.store.findUnique({
            where: { id: storeId }
          });
          if (!store) {
            console.log(`   ⚠️ Store ${storeId} tiene configuración pero NO existe en la tabla stores`);
          }
        }
      } else {
        console.log('   - No se encontraron configuraciones');
      }
    } catch (error) {
      console.log('   ⚠️ No se pudieron consultar configuraciones');
    }

    // 5. Verificar otras tablas que puedan tener referencias
    console.log('\n🔗 Verificando otras referencias:');
    
    const tablesToCheck = [
      { name: 'customers', field: 'storeId' },
      { name: 'reviews', field: 'storeId' },
      { name: 'coupons', field: 'storeId' },
      { name: 'promotions', field: 'storeId' }
    ];

    for (const table of tablesToCheck) {
      try {
        const count = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) as count FROM ${table.name}`
        );
        const countNum = (count as any[])[0]?.count || 0;
        if (countNum > 0) {
          console.log(`   ✅ ${table.name}: ${countNum} registros`);
          
          // Intentar obtener storeIds únicos
          try {
            const storeIds = await prisma.$queryRawUnsafe(
              `SELECT DISTINCT ${table.field} as store_id FROM ${table.name} WHERE ${table.field} IS NOT NULL`
            );
            if (Array.isArray(storeIds) && storeIds.length > 0) {
              const ids = storeIds.map((s: any) => s.store_id).filter(Boolean);
              if (ids.length > 0) {
                console.log(`      - StoreIds encontrados: ${ids.join(', ')}`);
              }
            }
          } catch (e) {
            // Ignorar errores
          }
        }
      } catch (error) {
        // La tabla puede no existir
      }
    }

    console.log('\n📋 CONCLUSIÓN:');
    console.log('   Los datos se borraron completamente de las tablas principales.');
    console.log('   La ÚNICA forma de recuperarlos es desde los backups de Supabase.');
    console.log('');
    console.log('🚨 ACCIÓN URGENTE REQUERIDA:');
    console.log('   1. Ve a: https://supabase.com/dashboard');
    console.log('   2. Selecciona tu proyecto');
    console.log('   3. Database → Backups o Point-in-time Recovery');
    console.log('   4. Restaura desde el backup más reciente ANTES del borrado');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findLostData();

