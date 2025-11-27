/**
 * Servicio de Versionado de Menús
 * Permite guardar snapshots del menú y restaurar versiones anteriores
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class MenuVersionService {
  /**
   * Crear snapshot del menú actual
   */
  async createSnapshot(storeId, description = '', createdBy = null) {
    // Obtener categorías y productos actuales
    const categories = await prisma.category.findMany({
      where: { storeId },
      include: {
        products: {
          include: {
            productOptionCategories: {
              include: {
                options: true,
              },
            },
          },
        },
      },
    });

    // Crear snapshot
    const snapshot = {
      version: await this.getNextVersion(storeId),
      storeId,
      description,
      createdBy,
      createdAt: new Date().toISOString(),
      data: {
        categories: categories.map(cat => ({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          imageUrl: cat.imageUrl,
          displayOrder: cat.displayOrder,
          isActive: cat.isActive,
          products: cat.products.map(prod => ({
            id: prod.id,
            name: prod.name,
            description: prod.description,
            price: prod.price,
            imageUrl: prod.imageUrl,
            isAvailable: prod.isAvailable,
            displayOrder: prod.displayOrder,
            options: prod.productOptionCategories.map(optCat => ({
              id: optCat.id,
              name: optCat.name,
              isRequired: optCat.isRequired,
              minSelections: optCat.minSelections,
              maxSelections: optCat.maxSelections,
              displayOrder: optCat.displayOrder,
              options: optCat.options.map(opt => ({
                id: opt.id,
                name: opt.name,
                priceModifier: opt.priceModifier,
                isAvailable: opt.isAvailable,
                displayOrder: opt.displayOrder,
              })),
            })),
          })),
        })),
      },
      stats: {
        categoriesCount: categories.length,
        productsCount: categories.reduce((sum, cat) => sum + cat.products.length, 0),
      },
    };

    // Guardar en Setting como JSON (en producción, usar tabla dedicada)
    const key = `menu_snapshot_${storeId}_${snapshot.version}`;
    await prisma.setting.create({
      data: {
        key,
        value: JSON.stringify(snapshot),
      },
    });

    // Actualizar índice de versiones
    await this.updateVersionIndex(storeId, snapshot.version, description);

    logger.info({
      storeId,
      version: snapshot.version,
      categories: snapshot.stats.categoriesCount,
      products: snapshot.stats.productsCount,
    }, 'Menu snapshot created');

    return snapshot;
  }

  /**
   * Obtener siguiente número de versión
   */
  async getNextVersion(storeId) {
    const versions = await this.getVersionList(storeId);
    if (versions.length === 0) return 1;
    return Math.max(...versions.map(v => v.version)) + 1;
  }

  /**
   * Obtener lista de versiones
   */
  async getVersionList(storeId) {
    const indexKey = `menu_versions_index_${storeId}`;
    const index = await prisma.setting.findUnique({
      where: { key: indexKey },
    });

    if (!index) return [];

    try {
      return JSON.parse(index.value);
    } catch {
      return [];
    }
  }

  /**
   * Actualizar índice de versiones
   */
  async updateVersionIndex(storeId, version, description) {
    const indexKey = `menu_versions_index_${storeId}`;
    const versions = await this.getVersionList(storeId);

    versions.push({
      version,
      description,
      createdAt: new Date().toISOString(),
    });

    await prisma.setting.upsert({
      where: { key: indexKey },
      create: { key: indexKey, value: JSON.stringify(versions) },
      update: { value: JSON.stringify(versions) },
    });
  }

  /**
   * Obtener snapshot específico
   */
  async getSnapshot(storeId, version) {
    const key = `menu_snapshot_${storeId}_${version}`;
    const setting = await prisma.setting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new Error(`Versión ${version} no encontrada`);
    }

    return JSON.parse(setting.value);
  }

  /**
   * Restaurar menú desde snapshot
   */
  async restoreSnapshot(storeId, version, createdBy = null) {
    const snapshot = await this.getSnapshot(storeId, version);

    // Crear backup del estado actual antes de restaurar
    await this.createSnapshot(storeId, `Backup antes de restaurar v${version}`, createdBy);

    // Usar transacción para restaurar
    await prisma.$transaction(async (tx) => {
      // 1. Eliminar opciones de productos
      await tx.productOption.deleteMany({
        where: {
          optionCategory: {
            product: { storeId },
          },
        },
      });

      // 2. Eliminar categorías de opciones
      await tx.productOptionCategory.deleteMany({
        where: {
          product: { storeId },
        },
      });

      // 3. Eliminar productos
      await tx.product.deleteMany({
        where: { storeId },
      });

      // 4. Eliminar categorías
      await tx.category.deleteMany({
        where: { storeId },
      });

      // 5. Restaurar categorías
      for (const cat of snapshot.data.categories) {
        const newCategory = await tx.category.create({
          data: {
            name: cat.name,
            description: cat.description,
            imageUrl: cat.imageUrl,
            displayOrder: cat.displayOrder,
            isActive: cat.isActive,
            storeId,
          },
        });

        // 6. Restaurar productos de la categoría
        for (const prod of cat.products) {
          const newProduct = await tx.product.create({
            data: {
              name: prod.name,
              description: prod.description,
              price: prod.price,
              imageUrl: prod.imageUrl,
              isAvailable: prod.isAvailable,
              displayOrder: prod.displayOrder,
              categoryId: newCategory.id,
              storeId,
            },
          });

          // 7. Restaurar opciones del producto
          for (const optCat of prod.options || []) {
            const newOptCat = await tx.productOptionCategory.create({
              data: {
                name: optCat.name,
                isRequired: optCat.isRequired,
                minSelections: optCat.minSelections,
                maxSelections: optCat.maxSelections,
                displayOrder: optCat.displayOrder,
                productId: newProduct.id,
              },
            });

            // 8. Restaurar opciones
            for (const opt of optCat.options || []) {
              await tx.productOption.create({
                data: {
                  name: opt.name,
                  priceModifier: opt.priceModifier,
                  isAvailable: opt.isAvailable,
                  displayOrder: opt.displayOrder,
                  optionCategoryId: newOptCat.id,
                },
              });
            }
          }
        }
      }
    });

    logger.info({
      storeId,
      restoredVersion: version,
      createdBy,
    }, 'Menu restored from snapshot');

    return {
      success: true,
      restoredVersion: version,
      stats: snapshot.stats,
    };
  }

  /**
   * Comparar dos versiones
   */
  async compareVersions(storeId, version1, version2) {
    const snapshot1 = await this.getSnapshot(storeId, version1);
    const snapshot2 = await this.getSnapshot(storeId, version2);

    const changes = {
      categoriesAdded: [],
      categoriesRemoved: [],
      productsAdded: [],
      productsRemoved: [],
      productsModified: [],
    };

    // Comparar categorías
    const cats1 = new Map(snapshot1.data.categories.map(c => [c.name, c]));
    const cats2 = new Map(snapshot2.data.categories.map(c => [c.name, c]));

    for (const [name, cat] of cats2) {
      if (!cats1.has(name)) {
        changes.categoriesAdded.push(name);
      }
    }

    for (const [name, cat] of cats1) {
      if (!cats2.has(name)) {
        changes.categoriesRemoved.push(name);
      }
    }

    // Comparar productos
    const prods1 = new Map();
    const prods2 = new Map();

    snapshot1.data.categories.forEach(cat => {
      cat.products.forEach(p => prods1.set(p.name, p));
    });

    snapshot2.data.categories.forEach(cat => {
      cat.products.forEach(p => prods2.set(p.name, p));
    });

    for (const [name, prod] of prods2) {
      if (!prods1.has(name)) {
        changes.productsAdded.push(name);
      } else {
        const oldProd = prods1.get(name);
        if (oldProd.price !== prod.price || oldProd.description !== prod.description) {
          changes.productsModified.push({
            name,
            priceChange: prod.price - oldProd.price,
            descriptionChanged: oldProd.description !== prod.description,
          });
        }
      }
    }

    for (const [name] of prods1) {
      if (!prods2.has(name)) {
        changes.productsRemoved.push(name);
      }
    }

    return {
      version1,
      version2,
      changes,
      hasChanges: Object.values(changes).some(arr => arr.length > 0),
    };
  }

  /**
   * Eliminar versiones antiguas (mantener últimas N)
   */
  async cleanupOldVersions(storeId, keepCount = 10) {
    const versions = await this.getVersionList(storeId);
    
    if (versions.length <= keepCount) {
      return { deleted: 0 };
    }

    // Ordenar por versión y obtener las que se deben eliminar
    const sorted = versions.sort((a, b) => b.version - a.version);
    const toDelete = sorted.slice(keepCount);

    for (const v of toDelete) {
      const key = `menu_snapshot_${storeId}_${v.version}`;
      await prisma.setting.delete({
        where: { key },
      }).catch(() => {}); // Ignorar si no existe
    }

    // Actualizar índice
    const remaining = sorted.slice(0, keepCount);
    const indexKey = `menu_versions_index_${storeId}`;
    await prisma.setting.update({
      where: { key: indexKey },
      data: { value: JSON.stringify(remaining) },
    });

    logger.info({
      storeId,
      deleted: toDelete.length,
      remaining: remaining.length,
    }, 'Old menu versions cleaned up');

    return { deleted: toDelete.length };
  }
}

export const menuVersionService = new MenuVersionService();
export default menuVersionService;

