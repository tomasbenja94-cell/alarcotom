import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...');

  // Limpiar datos existentes
  console.log('🧹 Limpiando datos existentes...');
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.productOptionCategory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  // Crear categorías
  console.log('📁 Creando categorías...');
  const categoriaPizzas = await prisma.category.create({
    data: {
      name: 'Pizzas',
      description: 'Pizzas artesanales',
      displayOrder: 1,
      isActive: true
    }
  });

  const categoriaHamburguesas = await prisma.category.create({
    data: {
      name: 'Hamburguesas',
      description: 'Hamburguesas gourmet',
      displayOrder: 2,
      isActive: true
    }
  });

  const categoriaBebidas = await prisma.category.create({
    data: {
      name: 'Bebidas',
      description: 'Bebidas frías y calientes',
      displayOrder: 3,
      isActive: true
    }
  });

  // Crear productos
  console.log('🍕 Creando productos...');
  
  // Pizzas
  const pizzaMuzzarella = await prisma.product.create({
    data: {
      name: 'Pizza Muzzarella',
      description: 'Pizza clásica con muzzarella y salsa de tomate',
      price: 2500,
      categoryId: categoriaPizzas.id,
      displayOrder: 1,
      isAvailable: true
    }
  });

  const pizzaNapolitana = await prisma.product.create({
    data: {
      name: 'Pizza Napolitana',
      description: 'Pizza con muzzarella, tomate, ajo y orégano',
      price: 2800,
      categoryId: categoriaPizzas.id,
      displayOrder: 2,
      isAvailable: true
    }
  });

  const pizzaEspecial = await prisma.product.create({
    data: {
      name: 'Pizza Especial',
      description: 'Pizza con jamón, morrones, huevo y aceitunas',
      price: 3200,
      categoryId: categoriaPizzas.id,
      displayOrder: 3,
      isAvailable: true
    }
  });

  // Hamburguesas
  const hamburguesaClasica = await prisma.product.create({
    data: {
      name: 'Hamburguesa Clásica',
      description: 'Carne, lechuga, tomate, cebolla y salsas',
      price: 1800,
      categoryId: categoriaHamburguesas.id,
      displayOrder: 1,
      isAvailable: true
    }
  });

  const hamburguesaCompleta = await prisma.product.create({
    data: {
      name: 'Hamburguesa Completa',
      description: 'Carne, queso, lechuga, tomate, cebolla, huevo y panceta',
      price: 2200,
      categoryId: categoriaHamburguesas.id,
      displayOrder: 2,
      isAvailable: true
    }
  });

  // Bebidas
  const cocaCola = await prisma.product.create({
    data: {
      name: 'Coca Cola 500ml',
      description: 'Gaseosa Coca Cola',
      price: 600,
      categoryId: categoriaBebidas.id,
      displayOrder: 1,
      isAvailable: true
    }
  });

  const agua = await prisma.product.create({
    data: {
      name: 'Agua Mineral 500ml',
      description: 'Agua mineral sin gas',
      price: 400,
      categoryId: categoriaBebidas.id,
      displayOrder: 2,
      isAvailable: true
    }
  });

  console.log('✅ Seed completado exitosamente!');
  console.log(`📊 Creados:`);
  console.log(`   - 3 categorías`);
  console.log(`   - 7 productos`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

