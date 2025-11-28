import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reconstructData() {
  try {
    console.log('🔧 Reconstruyendo tiendas y productos desde datos existentes...\n');

    // 1. Reconstruir stores desde order_items y store_settings
    console.log('🏪 Reconstruyendo tiendas...');
    
    // Obtener storeIds únicos de pedidos
    const ordersWithStores = await prisma.order.findMany({
      where: { storeId: { not: null } },
      select: { storeId: true },
      distinct: ['storeId']
    });

    const storeIdsFromOrders = ordersWithStores.map(o => o.storeId).filter(Boolean);
    console.log(`   - StoreIds encontrados en pedidos: ${storeIdsFromOrders.length}`);

    // Obtener storeIds de store_settings
    const settings = await prisma.storeSettings.findMany({
      select: { storeId: true }
    });
    const storeIdsFromSettings = settings.map(s => s.storeId).filter(Boolean);
    
    // Combinar todos los storeIds únicos
    const allStoreIds = [...new Set([...storeIdsFromOrders, ...storeIdsFromSettings])];
    console.log(`   - StoreIds únicos encontrados: ${allStoreIds.length}`);

    // Crear stores si no existen
    let storesCreated = 0;
    for (const storeId of allStoreIds) {
      const existingStore = await prisma.store.findUnique({
        where: { id: storeId }
      });

      if (!existingStore) {
        // Intentar obtener nombre desde store_settings
        const setting = await prisma.storeSettings.findUnique({
          where: { storeId }
        });

        const storeName = setting?.commercialName || `Tienda ${storeId.substring(0, 8)}`;

        await prisma.store.create({
          data: {
            id: storeId,
            name: storeName,
            isActive: true
          }
        });
        storesCreated++;
        console.log(`   ✅ Store creado: ${storeName} (${storeId})`);
      }
    }

    console.log(`\n   📊 Stores creados: ${storesCreated}`);

    // 2. Reconstruir productos desde order_items
    console.log('\n🛍️ Reconstruyendo productos desde pedidos...');

    // Obtener productos únicos de order_items
    const orderItems = await prisma.orderItem.findMany({
      select: {
        productName: true,
        unitPrice: true,
        order: {
          select: { storeId: true }
        }
      },
      distinct: ['productName', 'orderId']
    });

    console.log(`   - Items de pedidos encontrados: ${orderItems.length}`);

    // Agrupar por storeId y productName
    const productsByStore = new Map();

    for (const item of orderItems) {
      const storeId = item.order?.storeId;
      if (!storeId) continue;

      const key = `${storeId}-${item.productName}`;
      if (!productsByStore.has(key)) {
        productsByStore.set(key, {
          storeId,
          name: item.productName,
          price: item.unitPrice
        });
      }
    }

    console.log(`   - Productos únicos a crear: ${productsByStore.size}`);

    // Crear categoría "Recuperados" para cada store
    const categoriesByStore = new Map();
    let categoriesCreated = 0;
    let productsCreated = 0;

    for (const [key, product] of productsByStore) {
      const { storeId, name, price } = product;

      // Crear categoría si no existe
      if (!categoriesByStore.has(storeId)) {
        const existingCategory = await prisma.category.findFirst({
          where: {
            storeId,
            name: 'Recuperados'
          }
        });

        if (!existingCategory) {
          const category = await prisma.category.create({
            data: {
              name: 'Recuperados',
              description: 'Productos recuperados desde pedidos',
              storeId,
              isActive: true
            }
          });
          categoriesByStore.set(storeId, category.id);
          categoriesCreated++;
        } else {
          categoriesByStore.set(storeId, existingCategory.id);
        }
      }

      const categoryId = categoriesByStore.get(storeId);

      // Verificar si el producto ya existe
      const existingProduct = await prisma.product.findFirst({
        where: {
          storeId,
          name: name
        }
      });

      if (!existingProduct) {
        await prisma.product.create({
          data: {
            name: name,
            price: price || 0,
            storeId,
            categoryId,
            isAvailable: true
          }
        });
        productsCreated++;
      }
    }

    console.log(`\n   📊 Categorías creadas: ${categoriesCreated}`);
    console.log(`   📊 Productos creados: ${productsCreated}`);

    // 3. Resumen final
    console.log('\n✅ Reconstrucción completada!');
    console.log('\n📊 Resumen:');
    
    const finalStores = await prisma.store.count();
    const finalProducts = await prisma.product.count();
    const finalCategories = await prisma.category.count();

    console.log(`   - Stores: ${finalStores}`);
    console.log(`   - Productos: ${finalProducts}`);
    console.log(`   - Categorías: ${finalCategories}`);

    console.log('\n⚠️ NOTA:');
    console.log('   - Los productos se crearon en una categoría "Recuperados"');
    console.log('   - Puedes reorganizarlos en las categorías correctas desde el admin panel');
    console.log('   - Los precios se tomaron de los pedidos (pueden necesitar ajuste)');

  } catch (error) {
    console.error('❌ Error reconstruyendo datos:', error);
    console.error('   Detalles:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

reconstructData();

