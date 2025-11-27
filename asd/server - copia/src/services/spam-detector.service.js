import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ========== SERVICIO DE DETECCIÓN DE SPAM ==========
class SpamDetectorService {
  constructor() {
    // Store para tracking de mensajes (en producción usar Redis)
    this.messageHistory = new Map();
    
    // Configuración
    this.config = {
      maxMessagesPerMinute: 5, // Máximo 5 mensajes por minuto
      maxMessagesPerHour: 20, // Máximo 20 mensajes por hora
      maxSameMessageRepeats: 3, // Máximo 3 repeticiones del mismo mensaje
      spamPatterns: [
        /(.)\1{10,}/, // Caracteres repetidos (ej: aaaaaaaaaaa)
        /[A-Z]{20,}/, // Muchas mayúsculas seguidas
        /(http|www\.|https:\/\/)/gi, // URLs sospechosas (permitir algunos casos)
        /[!@#$%^&*()]{10,}/, // Muchos símbolos
        /\b(spam|viagra|casino|loan|winner)\b/gi // Palabras spam comunes
      ]
    };
  }

  // Detectar si un mensaje es spam
  detectSpamPattern(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return false;
    }

    return this.config.spamPatterns.some(pattern => pattern.test(messageText));
  }

  // Detectar mensajes repetidos
  async detectRepeatedMessages(phone, messageText) {
    const key = `repeats:${phone}`;
    const history = this.messageHistory.get(key) || [];
    const now = Date.now();

    // Filtrar mensajes de los últimos 5 minutos
    const recentMessages = history.filter(msg => now - msg.timestamp < 5 * 60 * 1000);

    // Contar mensajes idénticos
    const sameMessageCount = recentMessages.filter(msg => msg.text === messageText).length;

    if (sameMessageCount >= this.config.maxSameMessageRepeats) {
      return {
        isSpam: true,
        reason: `Mismo mensaje repetido ${sameMessageCount} veces`,
        count: sameMessageCount
      };
    }

    // Actualizar historial
    recentMessages.push({ text: messageText, timestamp: now });
    this.messageHistory.set(key, recentMessages.slice(-10)); // Mantener solo últimos 10

    return { isSpam: false };
  }

  // Verificar rate limiting por teléfono
  async checkRateLimit(phone) {
    const now = Date.now();
    const minuteKey = `rate:minute:${phone}`;
    const hourKey = `rate:hour:${phone}`;

    // Verificar límite por minuto
    const minuteHistory = this.messageHistory.get(minuteKey) || [];
    const recentMinute = minuteHistory.filter(timestamp => now - timestamp < 60 * 1000);

    if (recentMinute.length >= this.config.maxMessagesPerMinute) {
      return {
        exceeded: true,
        type: 'minute',
        limit: this.config.maxMessagesPerMinute,
        count: recentMinute.length,
        waitSeconds: 60 - Math.floor((now - recentMinute[0]) / 1000)
      };
    }

    // Verificar límite por hora
    const hourHistory = this.messageHistory.get(hourKey) || [];
    const recentHour = hourHistory.filter(timestamp => now - timestamp < 60 * 60 * 1000);

    if (recentHour.length >= this.config.maxMessagesPerHour) {
      return {
        exceeded: true,
        type: 'hour',
        limit: this.config.maxMessagesPerHour,
        count: recentHour.length,
        waitSeconds: 3600 - Math.floor((now - recentHour[0]) / 1000)
      };
    }

    // Actualizar historial
    recentMinute.push(now);
    recentHour.push(now);
    this.messageHistory.set(minuteKey, recentMinute.slice(-this.config.maxMessagesPerMinute));
    this.messageHistory.set(hourKey, recentHour.slice(-this.config.maxMessagesPerHour));

    return { exceeded: false };
  }

  // Verificar si un número está bloqueado
  async isPhoneBlocked(phone) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { phone },
        select: { isBlocked: true }
      });

      return customer?.isBlocked || false;
    } catch (error) {
      console.error('Error verificando si número está bloqueado:', error);
      return false;
    }
  }

  // Bloquear número temporalmente
  async blockPhoneTemporarily(phone, durationMinutes = 60) {
    try {
      let customer = await prisma.customer.findUnique({
        where: { phone }
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            phone,
            name: null,
            isBlocked: true,
            notes: `Bloqueado automáticamente por spam. Duración: ${durationMinutes} minutos`
          }
        });
      } else {
        await prisma.customer.update({
          where: { phone },
          data: {
            isBlocked: true,
            notes: `${customer.notes || ''}\nBloqueado automáticamente por spam el ${new Date().toISOString()}. Duración: ${durationMinutes} minutos`
          }
        });
      }

      // Desbloquear después de durationMinutes
      setTimeout(async () => {
        try {
          await prisma.customer.update({
            where: { phone },
            data: { isBlocked: false }
          });
          console.log(`Número ${phone} desbloqueado automáticamente`);
        } catch (error) {
          console.error('Error desbloqueando número:', error);
        }
      }, durationMinutes * 60 * 1000);

      return true;
    } catch (error) {
      console.error('Error bloqueando número:', error);
      return false;
    }
  }

  // Analizar mensaje completo
  async analyzeMessage(phone, messageText) {
    // 1. Verificar si está bloqueado
    const isBlocked = await this.isPhoneBlocked(phone);
    if (isBlocked) {
      return {
        isSpam: true,
        reason: 'Número bloqueado',
        action: 'blocked'
      };
    }

    // 2. Verificar rate limiting
    const rateLimit = await this.checkRateLimit(phone);
    if (rateLimit.exceeded) {
      await this.blockPhoneTemporarily(phone, 60); // Bloquear por 1 hora
      return {
        isSpam: true,
        reason: `Rate limit excedido (${rateLimit.type}): ${rateLimit.count}/${rateLimit.limit}`,
        action: 'rate_limit_exceeded',
        waitSeconds: rateLimit.waitSeconds
      };
    }

    // 3. Verificar patrones de spam
    if (this.detectSpamPattern(messageText)) {
      return {
        isSpam: true,
        reason: 'Patrón de spam detectado',
        action: 'spam_pattern'
      };
    }

    // 4. Verificar mensajes repetidos
    const repeated = await this.detectRepeatedMessages(phone, messageText);
    if (repeated.isSpam) {
      return {
        isSpam: true,
        reason: repeated.reason,
        action: 'repeated_message',
        count: repeated.count
      };
    }

    return { isSpam: false };
  }

  // Limpiar historial expirado
  cleanupExpiredHistory() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas

    for (const [key, value] of this.messageHistory.entries()) {
      if (Array.isArray(value)) {
        const filtered = value.filter(item => {
          if (typeof item === 'number') {
            return now - item < maxAge;
          }
          if (typeof item === 'object' && item.timestamp) {
            return now - item.timestamp < maxAge;
          }
          return false;
        });

        if (filtered.length === 0) {
          this.messageHistory.delete(key);
        } else {
          this.messageHistory.set(key, filtered);
        }
      }
    }
  }
}

// Limpiar historial cada hora
const spamDetector = new SpamDetectorService();
setInterval(() => {
  spamDetector.cleanupExpiredHistory();
}, 60 * 60 * 1000); // Cada hora

export { spamDetector as spamDetectorService };

