/**
 * Sistema de Integración con Redes Sociales
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class SocialMediaService {
  /**
   * Publicar en redes sociales
   */
  async publishPost(storeId, postData) {
    const { content, imageUrl, platforms, scheduledFor } = postData;

    const post = await prisma.socialPost.create({
      data: {
        storeId,
        content,
        imageUrl,
        platforms,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        status: scheduledFor ? 'scheduled' : 'pending',
      },
    });

    if (!scheduledFor) {
      await this.publishToAllPlatforms(post);
    }

    logger.info({ postId: post.id, platforms }, 'Social post created');
    return post;
  }

  async publishToAllPlatforms(post) {
    const results = {};

    for (const platform of post.platforms) {
      try {
        const result = await this.publishToPlatform(post.storeId, platform, post);
        results[platform] = { success: true, postId: result.id };
      } catch (error) {
        results[platform] = { success: false, error: error.message };
      }
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        platformResults: JSON.stringify(results),
      },
    });

    return results;
  }

  async publishToPlatform(storeId, platform, post) {
    const credentials = await this.getCredentials(storeId, platform);
    if (!credentials) throw new Error(`No hay credenciales para ${platform}`);

    // Simulación de publicación (integrar con APIs reales)
    switch (platform) {
      case 'instagram':
        return this.publishToInstagram(credentials, post);
      case 'facebook':
        return this.publishToFacebook(credentials, post);
      case 'twitter':
        return this.publishToTwitter(credentials, post);
      default:
        throw new Error(`Plataforma ${platform} no soportada`);
    }
  }

  async publishToInstagram(credentials, post) {
    // Integrar con Instagram Graph API
    logger.info({ platform: 'instagram' }, 'Publishing to Instagram');
    return { id: 'ig_' + Date.now(), url: 'https://instagram.com/p/xxx' };
  }

  async publishToFacebook(credentials, post) {
    // Integrar con Facebook Graph API
    logger.info({ platform: 'facebook' }, 'Publishing to Facebook');
    return { id: 'fb_' + Date.now(), url: 'https://facebook.com/post/xxx' };
  }

  async publishToTwitter(credentials, post) {
    // Integrar con Twitter API v2
    logger.info({ platform: 'twitter' }, 'Publishing to Twitter');
    return { id: 'tw_' + Date.now(), url: 'https://twitter.com/status/xxx' };
  }

  async getCredentials(storeId, platform) {
    return prisma.socialCredential.findFirst({
      where: { storeId, platform, isActive: true },
    });
  }

  /**
   * Conectar cuenta de red social
   */
  async connectAccount(storeId, platform, authData) {
    const { accessToken, refreshToken, accountId, accountName, expiresAt } = authData;

    const credential = await prisma.socialCredential.upsert({
      where: { storeId_platform: { storeId, platform } },
      update: {
        accessToken,
        refreshToken,
        accountId,
        accountName,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      },
      create: {
        storeId,
        platform,
        accessToken,
        refreshToken,
        accountId,
        accountName,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      },
    });

    logger.info({ storeId, platform, accountName }, 'Social account connected');
    return credential;
  }

  /**
   * Generar contenido automático
   */
  async generateAutoContent(storeId, type) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });

    const templates = {
      new_product: async () => {
        const product = await prisma.product.findFirst({
          where: { storeId, isAvailable: true },
          orderBy: { createdAt: 'desc' },
        });
        return product ? {
          content: `🆕 ¡Nuevo en ${store.name}! ${product.name} - ${product.description}\n\n📱 Pedí ahora por WhatsApp`,
          imageUrl: product.image,
        } : null;
      },
      promo: async () => {
        const promo = await prisma.promotion.findFirst({
          where: { storeId, isActive: true, endDate: { gte: new Date() } },
        });
        return promo ? {
          content: `🔥 ${promo.name}\n\n${promo.description}\n\n⏰ Válido hasta ${promo.endDate.toLocaleDateString()}\n\n📱 Usá el código: ${promo.code}`,
        } : null;
      },
      top_product: async () => {
        const topProduct = await prisma.orderItem.groupBy({
          by: ['productId'],
          where: { order: { storeId, status: 'delivered' } },
          _count: true,
          orderBy: { _count: { productId: 'desc' } },
          take: 1,
        });
        if (topProduct[0]) {
          const product = await prisma.product.findUnique({ where: { id: topProduct[0].productId } });
          return {
            content: `⭐ ¡El favorito de nuestros clientes!\n\n${product.name}\n\n¿Ya lo probaste? 📱 Pedí ahora`,
            imageUrl: product.image,
          };
        }
        return null;
      },
      review: async () => {
        const review = await prisma.storeReview.findFirst({
          where: { storeId, rating: { gte: 4 } },
          orderBy: { createdAt: 'desc' },
        });
        return review ? {
          content: `💬 Lo que dicen nuestros clientes:\n\n"${review.comment}"\n\n⭐ ${review.rating}/5\n\n¡Gracias por confiar en nosotros! 🙏`,
        } : null;
      },
    };

    const generator = templates[type];
    if (!generator) throw new Error('Tipo de contenido no soportado');

    return generator();
  }

  /**
   * Programar publicaciones automáticas
   */
  async scheduleAutoPosting(storeId, config) {
    const { enabled, frequency, platforms, contentTypes, bestTimes } = config;

    await prisma.socialAutoPost.upsert({
      where: { storeId },
      update: {
        enabled,
        frequency,
        platforms,
        contentTypes,
        bestTimes: bestTimes || ['12:00', '19:00'],
      },
      create: {
        storeId,
        enabled,
        frequency,
        platforms,
        contentTypes,
        bestTimes: bestTimes || ['12:00', '19:00'],
      },
    });

    return { success: true };
  }

  /**
   * Obtener métricas de redes sociales
   */
  async getSocialMetrics(storeId, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const posts = await prisma.socialPost.findMany({
      where: { storeId, publishedAt: { gte: startDate } },
    });

    const byPlatform = {};
    posts.forEach(post => {
      post.platforms.forEach(platform => {
        if (!byPlatform[platform]) {
          byPlatform[platform] = { posts: 0, engagement: 0 };
        }
        byPlatform[platform].posts++;
        // Agregar engagement real de las APIs
      });
    });

    return {
      totalPosts: posts.length,
      byPlatform,
      topPerforming: posts.slice(0, 5),
    };
  }

  /**
   * Compartir pedido en redes
   */
  async shareOrderToSocial(orderId, platform) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true, items: { include: { product: true } } },
    });

    const content = `🍔 ¡Acabo de pedir en ${order.store.name}!\n\n${order.items.map(i => `• ${i.quantity}x ${i.product.name}`).join('\n')}\n\n¡Lo recomiendo! 👍`;

    return { content, shareUrl: `https://wa.me/?text=${encodeURIComponent(content)}` };
  }

  /**
   * Monitorear menciones
   */
  async getMentions(storeId, platform) {
    // Integrar con APIs de cada plataforma para buscar menciones
    // Esto requiere acceso a APIs específicas de cada red social
    logger.info({ storeId, platform }, 'Fetching mentions');
    return [];
  }

  /**
   * Responder a comentarios
   */
  async replyToComment(storeId, platform, commentId, reply) {
    const credentials = await this.getCredentials(storeId, platform);
    if (!credentials) throw new Error('No hay credenciales');

    // Integrar con APIs de cada plataforma
    logger.info({ platform, commentId }, 'Replying to comment');
    return { success: true };
  }
}

export const socialMediaService = new SocialMediaService();
export default socialMediaService;

