import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reactivateStores() {
  try {
    console.log('🔄 Reactivando stores inactivos...\n');

    // Buscar todos los stores inactivos
    const inactiveStores = await prisma.store.findMany({
      where: { isActive: false }
    });

    if (inactiveStores.length === 0) {
      console.log('✅ No hay stores inactivos para reactivar.');
      return;
    }

    console.log(`📦 Encontrados ${inactiveStores.length} stores inactivos:`);
    inactiveStores.forEach(store => {
      console.log(`   - ${store.name} (ID: ${store.id})`);
    });

    // Reactivar todos los stores
    const result = await prisma.store.updateMany({
      where: { isActive: false },
      data: { isActive: true }
    });

    console.log(`\n✅ ${result.count} stores reactivados exitosamente.`);

    // Verificar productos asociados
    for (const store of inactiveStores) {
      const productCount = await prisma.product.count({
        where: { storeId: store.id }
      });
      const categoryCount = await prisma.category.count({
        where: { storeId: store.id }
      });
      
      console.log(`\n📊 ${store.name}:`);
      console.log(`   - Productos: ${productCount}`);
      console.log(`   - Categorías: ${categoryCount}`);
    }

  } catch (error) {
    console.error('❌ Error reactivando stores:', error);
  } finally {
    await prisma.$disconnect();
  }
}

reactivateStores();

