import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class InventoryService {
  /**
   * Agregar/actualizar stock de ingrediente
   */
  async updateStock(storeId, ingredientId, quantity, type, reason, userId) {
    try {
      const current = await prisma.inventory.findFirst({
        where: { storeId, ingredientId }
      });

      const newQuantity = type === 'ADD' 
        ? (current?.quantity || 0) + quantity 
        : (current?.quantity || 0) - quantity;

      const inventory = await prisma.inventory.upsert({
        where: { id: current?.id || 'new' },
        create: {
          storeId,
          ingredientId,
          quantity: newQuantity,
          lastUpdated: new Date()
        },
        update: {
          quantity: newQuantity,
          lastUpdated: new Date()
        }
      });

      // Registrar movimiento
      await prisma.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type,
          quantity,
          reason,
          createdBy: userId,
          createdAt: new Date()
        }
      });

      // Verificar stock bajo
      await this.checkLowStock(inventory);

      logger.info({ ingredientId, type, quantity }, 'Stock actualizado');
      return inventory;
    } catch (error) {
      logger.error({ error, ingredientId }, 'Error actualizando stock');
      throw error;
    }
  }

  /**
   * Descontar stock por pedido
   */
  async deductOrderStock(orderId) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: {
                include: { recipe: { include: { ingredients: true } } }
              }
            }
          }
        }
      });

      for (const item of order.items) {
        const recipe = item.product.recipe;
        if (!recipe) continue;

        for (const recipeIngredient of recipe.ingredients) {
          const quantityNeeded = recipeIngredient.quantity * item.quantity;
          await this.updateStock(
            order.storeId,
            recipeIngredient.ingredientId,
            quantityNeeded,
            'SUBTRACT',
            `Pedido #${order.orderNumber}`,
            null
          );
        }
      }

      logger.info({ orderId }, 'Stock descontado por pedido');
    } catch (error) {
      logger.error({ error, orderId }, 'Error descontando stock');
      throw error;
    }
  }

  /**
   * Verificar stock bajo y alertar
   */
  async checkLowStock(inventory) {
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: inventory.ingredientId }
    });

    if (inventory.quantity <= (ingredient?.minStock || 10)) {
      await prisma.stockAlert.create({
        data: {
          inventoryId: inventory.id,
          ingredientId: inventory.ingredientId,
          currentStock: inventory.quantity,
          minStock: ingredient?.minStock || 10,
          status: 'PENDING',
          createdAt: new Date()
        }
      });

      logger.warn({ ingredientId: inventory.ingredientId, stock: inventory.quantity }, 'Stock bajo detectado');
    }
  }

  /**
   * Obtener inventario actual
   */
  async getInventory(storeId) {
    return prisma.inventory.findMany({
      where: { storeId },
      include: { ingredient: true },
      orderBy: { ingredient: { name: 'asc' } }
    });
  }

  /**
   * Obtener alertas de stock bajo
   */
  async getLowStockAlerts(storeId) {
    return prisma.stockAlert.findMany({
      where: { 
        inventory: { storeId },
        status: 'PENDING'
      },
      include: { ingredient: true }
    });
  }

  /**
   * Historial de movimientos
   */
  async getMovementHistory(storeId, ingredientId = null, days = 30) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    return prisma.inventoryMovement.findMany({
      where: {
        inventory: { storeId },
        ...(ingredientId && { inventory: { ingredientId } }),
        createdAt: { gte: dateFrom }
      },
      include: { inventory: { include: { ingredient: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Reporte de consumo
   */
  async getConsumptionReport(storeId, startDate, endDate) {
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        inventory: { storeId },
        type: 'SUBTRACT',
        createdAt: { gte: startDate, lte: endDate }
      },
      include: { inventory: { include: { ingredient: true } } }
    });

    const consumption = {};
    movements.forEach(m => {
      const name = m.inventory.ingredient.name;
      consumption[name] = (consumption[name] || 0) + m.quantity;
    });

    return Object.entries(consumption)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity);
  }
}

export const inventoryService = new InventoryService();
export default inventoryService;
