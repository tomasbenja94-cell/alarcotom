import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ========== SERVICIO DE CÓDIGOS DE ENTREGA ==========
class DeliveryCodeService {
  // Generar código seguro de 4 dígitos
  generateDeliveryCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Validar código con tolerancia a errores y límite de intentos
  async validateDeliveryCode(input, expectedCode, orderId, driverId) {
    // Normalizar (quitar espacios, guiones, convertir a mayúsculas)
    const normalizedInput = input.replace(/[\s-]/g, '').trim();
    const normalizedExpected = expectedCode?.replace(/[\s-]/g, '').trim() || '';

    // Verificar que el código existe
    if (!expectedCode) {
      throw new Error('Este pedido no tiene código de entrega asignado');
    }

    // Registrar intento (prevenir brute force)
    const attempt = await this.recordAttempt(orderId, driverId, normalizedInput);

    // Límite de intentos: 5 por pedido
    if (attempt.attemptCount > 5) {
      console.warn('Demasiados intentos de código', { orderId, driverId, attempts: attempt.attemptCount });
      throw new Error('Demasiados intentos fallidos. Contacta al administrador.');
    }

    // Verificación exacta (case-insensitive)
    if (normalizedInput.toLowerCase() === normalizedExpected.toLowerCase()) {
      await this.markCodeAsUsed(orderId);
      return { valid: true, attempts: attempt.attemptCount };
    }

    // Verificación con Levenshtein (tolerancia a 1 error)
    const distance = this.levenshteinDistance(
      normalizedInput.toLowerCase(),
      normalizedExpected.toLowerCase()
    );

    if (distance <= 1 && normalizedInput.length === normalizedExpected.length) {
      await this.markCodeAsUsed(orderId);
      console.info('Código aceptado con tolerancia a errores', {
        orderId,
        input: normalizedInput,
        expected: normalizedExpected,
        distance
      });
      return { valid: true, attempts: attempt.attemptCount };
    }

    return { valid: false, attempts: attempt.attemptCount };
  }

  // Registrar intento (prevenir brute force)
  async recordAttempt(orderId, driverId, input) {
    try {
      const attempt = await prisma.deliveryCodeAttempt.upsert({
        where: {
          orderId_driverId: { orderId, driverId }
        },
        create: {
          orderId,
          driverId,
          attemptCount: 1,
          lastAttemptAt: new Date()
        },
        update: {
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date()
        }
      });

      return attempt;
    } catch (error) {
      // Si falla, crear manualmente
      const attempt = await prisma.deliveryCodeAttempt.findFirst({
        where: { orderId, driverId }
      });

      if (attempt) {
        return await prisma.deliveryCodeAttempt.update({
          where: { id: attempt.id },
          data: {
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date()
          }
        });
      }

      return await prisma.deliveryCodeAttempt.create({
        data: {
          orderId,
          driverId,
          attemptCount: 1,
          lastAttemptAt: new Date()
        }
      });
    }
  }

  // Marcar código como usado (no reutilizable)
  async markCodeAsUsed(orderId) {
    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryCode: null } // Eliminar código después de usar
    });

    // Limpiar intentos
    await prisma.deliveryCodeAttempt.deleteMany({
      where: { orderId }
    });
  }

  // Levenshtein distance
  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2[i - 1] === str1[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }
}

export const deliveryCodeService = new DeliveryCodeService();

