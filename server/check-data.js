import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  try {
    console.log('🔍 Verificando datos en la base de datos...\n');

    // Verificar stores (incluyendo inactivos)
    const allStores = await prisma.store.findMany({});
    const activeStores = await prisma.store.findMany({
      where: { isActive: true }
    });
    const inactiveStores = await prisma.store.findMany({
      where: { isActive: false }
    });

    console.log(`📦 Stores encontrados:`);
    console.log(`   - Total: ${allStores.length}`);
    console.log(`   - Activos: ${activeStores.length}`);
    console.log(`   - Inactivos: ${inactiveStores.length}`);

    if (allStores.length > 0) {
      console.log(`\n📋 Lista de stores:`);
      allStores.forEach(store => {
        console.log(`   - ${store.name} (ID: ${store.id}) - Activo: ${store.isActive}`);
      });
    }

    // Verificar productos
    const allProducts = await prisma.product.findMany({});
    const productsByStore = await prisma.product.groupBy({
      by: ['storeId'],
      _count: true
    });

    console.log(`\n🛍️ Productos encontrados:`);
    console.log(`   - Total: ${allProducts.length}`);
    console.log(`   - Por tienda:`);
    productsByStore.forEach(group => {
      const storeName = allStores.find(s => s.id === group.storeId)?.name || 'Sin tienda';
      console.log(`     - ${storeName}: ${group._count} productos`);
    });

    // Verificar categorías
    const allCategories = await prisma.category.findMany({});
    const categoriesByStore = await prisma.category.groupBy({
      by: ['storeId'],
      _count: true
    });

    console.log(`\n📁 Categorías encontradas:`);
    console.log(`   - Total: ${allCategories.length}`);
    console.log(`   - Por tienda:`);
    categoriesByStore.forEach(group => {
      const storeName = allStores.find(s => s.id === group.storeId)?.name || 'Sin tienda';
      console.log(`     - ${storeName}: ${group._count} categorías`);
    });

    // Si hay stores inactivos, ofrecer reactivarlos
    if (inactiveStores.length > 0) {
      console.log(`\n⚠️ Se encontraron ${inactiveStores.length} stores inactivos.`);
      console.log(`   Puedes reactivarlos ejecutando: node reactivate-stores.js`);
    }

  } catch (error) {
    console.error('❌ Error verificando datos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();

