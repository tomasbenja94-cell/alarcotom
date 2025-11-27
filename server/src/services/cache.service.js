/**
 * Servicio de Cache
 * Usa Redis si está disponible, sino fallback a memoria
 */

import logger from '../utils/logger.js';

class CacheService {
  constructor() {
    this.redis = null;
    this.memoryCache = new Map();
    this.ttls = new Map(); // Para TTL en memoria
  }

  /**
   * Inicializar conexión Redis
   */
  async init() {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        logger.info('Redis URL no configurada, usando cache en memoria');
        return;
      }

      const { createClient } = await import('redis');
      this.redis = createClient({ url: redisUrl });
      
      this.redis.on('error', (err) => {
        logger.error({ error: err.message }, 'Redis error');
      });

      await this.redis.connect();
      logger.info('Redis conectado correctamente');
    } catch (error) {
      logger.warn({ error: error.message }, 'No se pudo conectar a Redis, usando cache en memoria');
      this.redis = null;
    }
  }

  /**
   * Obtener valor del cache
   */
  async get(key) {
    try {
      if (this.redis) {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      }
      
      // Memoria: verificar TTL
      if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
        this.memoryCache.delete(key);
        this.ttls.delete(key);
        return null;
      }
      
      return this.memoryCache.get(key) || null;
    } catch (error) {
      logger.error({ error: error.message, key }, 'Error obteniendo cache');
      return null;
    }
  }

  /**
   * Guardar valor en cache
   */
  async set(key, value, ttlSeconds = 300) {
    try {
      if (this.redis) {
        await this.redis.setEx(key, ttlSeconds, JSON.stringify(value));
      } else {
        this.memoryCache.set(key, value);
        this.ttls.set(key, Date.now() + (ttlSeconds * 1000));
      }
      return true;
    } catch (error) {
      logger.error({ error: error.message, key }, 'Error guardando cache');
      return false;
    }
  }

  /**
   * Eliminar valor del cache
   */
  async del(key) {
    try {
      if (this.redis) {
        await this.redis.del(key);
      } else {
        this.memoryCache.delete(key);
        this.ttls.delete(key);
      }
      return true;
    } catch (error) {
      logger.error({ error: error.message, key }, 'Error eliminando cache');
      return false;
    }
  }

  /**
   * Eliminar por patrón (solo Redis)
   */
  async delPattern(pattern) {
    try {
      if (this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } else {
        // Memoria: buscar por patrón simple
        const regex = new RegExp(pattern.replace('*', '.*'));
        for (const key of this.memoryCache.keys()) {
          if (regex.test(key)) {
            this.memoryCache.delete(key);
            this.ttls.delete(key);
          }
        }
      }
      return true;
    } catch (error) {
      logger.error({ error: error.message, pattern }, 'Error eliminando cache por patrón');
      return false;
    }
  }

  /**
   * Limpiar todo el cache
   */
  async flush() {
    try {
      if (this.redis) {
        await this.redis.flushDb();
      } else {
        this.memoryCache.clear();
        this.ttls.clear();
      }
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'Error limpiando cache');
      return false;
    }
  }

  // ============ HELPERS ESPECÍFICOS ============

  /**
   * Cache de menú por tienda
   */
  async getMenu(storeId) {
    return this.get(`menu:${storeId}`);
  }

  async setMenu(storeId, menu, ttl = 300) {
    return this.set(`menu:${storeId}`, menu, ttl);
  }

  async invalidateMenu(storeId) {
    return this.del(`menu:${storeId}`);
  }

  /**
   * Cache de configuración de tienda
   */
  async getStoreConfig(storeId) {
    return this.get(`store:config:${storeId}`);
  }

  async setStoreConfig(storeId, config, ttl = 600) {
    return this.set(`store:config:${storeId}`, config, ttl);
  }

  async invalidateStoreConfig(storeId) {
    return this.del(`store:config:${storeId}`);
  }

  /**
   * Cache de categorías por tienda
   */
  async getCategories(storeId) {
    return this.get(`categories:${storeId}`);
  }

  async setCategories(storeId, categories, ttl = 300) {
    return this.set(`categories:${storeId}`, categories, ttl);
  }

  /**
   * Cache de productos por categoría
   */
  async getProductsByCategory(storeId, categoryId) {
    return this.get(`products:${storeId}:${categoryId}`);
  }

  async setProductsByCategory(storeId, categoryId, products, ttl = 300) {
    return this.set(`products:${storeId}:${categoryId}`, products, ttl);
  }

  /**
   * Invalidar todo el cache de una tienda
   */
  async invalidateStore(storeId) {
    await this.delPattern(`*:${storeId}*`);
  }

  /**
   * Obtener estadísticas del cache
   */
  getStats() {
    if (this.redis) {
      return { type: 'redis', connected: this.redis.isOpen };
    }
    return {
      type: 'memory',
      size: this.memoryCache.size,
      keys: Array.from(this.memoryCache.keys()).slice(0, 10),
    };
  }
}

// Singleton
export const cacheService = new CacheService();
export default cacheService;

