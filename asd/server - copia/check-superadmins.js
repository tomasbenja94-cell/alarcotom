// Script para verificar superadmins activos desde Node.js
// Ejecutar: node check-superadmins.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSuperAdmins() {
  try {
    console.log('🔍 Buscando superadmins activos...\n');

    // Superadmins activos
    const activeSuperAdmins = await prisma.admin.findMany({
      where: {
        role: 'super_admin',
        isActive: true
      },
      select: {
        id: true,
        username: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ Superadmins activos encontrados: ${activeSuperAdmins.length}\n`);
    
    if (activeSuperAdmins.length > 0) {
      console.log('📋 Lista de superadmins activos:');
      console.log('─'.repeat(80));
      activeSuperAdmins.forEach((admin, index) => {
        console.log(`\n${index + 1}. Usuario: ${admin.username}`);
        console.log(`   ID: ${admin.id}`);
        console.log(`   Rol: ${admin.role}`);
        console.log(`   Store ID: ${admin.storeId || 'N/A (correcto para superadmin)'}`);
        console.log(`   Activo: ${admin.isActive ? '✅ Sí' : '❌ No'}`);
        console.log(`   Creado: ${admin.createdAt.toLocaleString('es-AR')}`);
        console.log(`   Actualizado: ${admin.updatedAt.toLocaleString('es-AR')}`);
      });
      console.log('\n' + '─'.repeat(80));
    } else {
      console.log('⚠️  No se encontraron superadmins activos.');
    }

    // Todos los superadmins (activos e inactivos)
    const allSuperAdmins = await prisma.admin.findMany({
      where: {
        role: 'super_admin'
      },
      select: {
        id: true,
        username: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    if (allSuperAdmins.length > activeSuperAdmins.length) {
      console.log(`\n⚠️  Total de superadmins (incluyendo inactivos): ${allSuperAdmins.length}`);
      const inactive = allSuperAdmins.filter(a => !a.isActive);
      if (inactive.length > 0) {
        console.log(`   Inactivos: ${inactive.length}`);
        inactive.forEach(admin => {
          console.log(`   - ${admin.username} (inactivo)`);
        });
      }
    }

    // Resumen de todos los roles
    const roleCounts = await prisma.admin.groupBy({
      by: ['role', 'isActive'],
      _count: {
        id: true
      }
    });

    console.log('\n📊 Resumen de todos los admins:');
    console.log('─'.repeat(80));
    roleCounts.forEach(({ role, isActive, _count }) => {
      const status = isActive ? '✅ Activo' : '❌ Inactivo';
      console.log(`   ${role}: ${_count.id} (${status})`);
    });
    console.log('─'.repeat(80));

  } catch (error) {
    console.error('❌ Error al consultar superadmins:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSuperAdmins();

