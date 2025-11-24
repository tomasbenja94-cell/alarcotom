import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Verificando estado de la base de datos...\n');

    // Verificar stores
    const stores = await prisma.store.findMany();
    console.log(`📦 Stores: ${stores.length}`);
    if (stores.length > 0) {
      stores.forEach(store => {
        console.log(`   - ${store.name} (${store.id}) - Panel: ${store.panelType || 'normal'}`);
      });
    } else {
      console.log('   ⚠️  No hay stores en la base de datos');
    }

    // Verificar categorías
    const categories = await prisma.category.findMany();
    console.log(`\n📁 Categorías: ${categories.length}`);
    if (categories.length > 0) {
      categories.slice(0, 5).forEach(cat => {
        console.log(`   - ${cat.name} (${cat.id})`);
      });
      if (categories.length > 5) {
        console.log(`   ... y ${categories.length - 5} más`);
      }
    } else {
      console.log('   ⚠️  No hay categorías en la base de datos');
    }

    // Verificar productos
    const products = await prisma.product.findMany();
    console.log(`\n🛍️  Productos: ${products.length}`);
    if (products.length > 0) {
      products.slice(0, 5).forEach(prod => {
        console.log(`   - ${prod.name} (${prod.id}) - $${prod.price}`);
      });
      if (products.length > 5) {
        console.log(`   ... y ${products.length - 5} más`);
      }
    } else {
      console.log('   ⚠️  No hay productos en la base de datos');
    }

    // Verificar pedidos
    const orders = await prisma.order.findMany();
    console.log(`\n📋 Pedidos: ${orders.length}`);
    if (orders.length > 0) {
      const recentOrders = orders.slice(-5);
      recentOrders.forEach(order => {
        console.log(`   - #${order.order_number} - ${order.customer_name} - $${order.total} - ${order.status}`);
      });
    } else {
      console.log('   ⚠️  No hay pedidos en la base de datos');
    }

    // Verificar admins
    const admins = await prisma.admin.findMany();
    console.log(`\n👤 Admins: ${admins.length}`);
    if (admins.length > 0) {
      admins.forEach(admin => {
        console.log(`   - ${admin.username} (${admin.role}) - Store: ${admin.storeId || 'N/A'}`);
      });
    } else {
      console.log('   ⚠️  No hay admins en la base de datos');
    }

    console.log('\n✅ Verificación completada');

    // Si no hay datos, sugerir recuperación
    if (stores.length === 0 && categories.length === 0 && products.length === 0) {
      console.log('\n⚠️  ADVERTENCIA: La base de datos parece estar vacía.');
      console.log('💡 Opciones de recuperación:');
      console.log('   1. Verificar backups de Supabase (Dashboard → Database → Backups)');
      console.log('   2. Restaurar desde un backup si está disponible');
      console.log('   3. Si no hay backup, los datos no se pueden recuperar automáticamente');
    }

  } catch (error) {
    console.error('❌ Error al verificar base de datos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();

