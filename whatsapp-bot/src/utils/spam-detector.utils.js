// ========== DETECTOR DE SPAM PARA BOT DE WHATSAPP ==========

// Store para tracking de mensajes (en producción usar Redis o DB)
const messageHistory = new Map();

// Configuración
const config = {
  maxMessagesPerMinute: 5, // Máximo 5 mensajes por minuto
  maxMessagesPerHour: 20, // Máximo 20 mensajes por hora
  maxSameMessageRepeats: 3, // Máximo 3 repeticiones del mismo mensaje
  spamPatterns: [
    /(.)\1{10,}/, // Caracteres repetidos (ej: aaaaaaaaaaa)
    /[A-Z]{20,}/, // Muchas mayúsculas seguidas
    /[!@#$%^&*()]{10,}/, // Muchos símbolos
    /\b(spam|viagra|casino|loan|winner|prize|click|free|urgent)\b/gi // Palabras spam comunes
  ]
};

// Detectar si un mensaje tiene patrones de spam
function detectSpamPattern(messageText) {
  if (!messageText || typeof messageText !== 'string') {
    return false;
  }

  return config.spamPatterns.some(pattern => pattern.test(messageText));
}

// Detectar mensajes repetidos
function detectRepeatedMessages(phone, messageText) {
  const key = `repeats:${phone}`;
  const history = messageHistory.get(key) || [];
  const now = Date.now();

  // Filtrar mensajes de los últimos 5 minutos
  const recentMessages = history.filter(msg => now - msg.timestamp < 5 * 60 * 1000);

  // Contar mensajes idénticos
  const sameMessageCount = recentMessages.filter(msg => msg.text === messageText).length;

  if (sameMessageCount >= config.maxSameMessageRepeats) {
    return {
      isSpam: true,
      reason: `Mismo mensaje repetido ${sameMessageCount} veces`,
      count: sameMessageCount
    };
  }

  // Actualizar historial
  recentMessages.push({ text: messageText, timestamp: now });
  messageHistory.set(key, recentMessages.slice(-10)); // Mantener solo últimos 10

  return { isSpam: false };
}

// Verificar rate limiting por teléfono
function checkRateLimit(phone) {
  const now = Date.now();
  const minuteKey = `rate:minute:${phone}`;
  const hourKey = `rate:hour:${phone}`;

  // Verificar límite por minuto
  const minuteHistory = messageHistory.get(minuteKey) || [];
  const recentMinute = minuteHistory.filter(timestamp => now - timestamp < 60 * 1000);

  if (recentMinute.length >= config.maxMessagesPerMinute) {
    return {
      exceeded: true,
      type: 'minute',
      limit: config.maxMessagesPerMinute,
      count: recentMinute.length,
      waitSeconds: 60 - Math.floor((now - recentMinute[0]) / 1000)
    };
  }

  // Verificar límite por hora
  const hourHistory = messageHistory.get(hourKey) || [];
  const recentHour = hourHistory.filter(timestamp => now - timestamp < 60 * 60 * 1000);

  if (recentHour.length >= config.maxMessagesPerHour) {
    return {
      exceeded: true,
      type: 'hour',
      limit: config.maxMessagesPerHour,
      count: recentHour.length,
      waitSeconds: 3600 - Math.floor((now - recentHour[0]) / 1000)
    };
  }

  // Actualizar historial
  recentMinute.push(now);
  recentHour.push(now);
  messageHistory.set(minuteKey, recentMinute.slice(-config.maxMessagesPerMinute));
  messageHistory.set(hourKey, recentHour.slice(-config.maxMessagesPerHour));

  return { exceeded: false };
}

// Analizar mensaje completo
async function analyzeMessage(phone, messageText) {
  // 1. Verificar rate limiting
  const rateLimit = checkRateLimit(phone);
  if (rateLimit.exceeded) {
    return {
      isSpam: true,
      reason: `Rate limit excedido (${rateLimit.type}): ${rateLimit.count}/${rateLimit.limit}`,
      action: 'rate_limit_exceeded',
      waitSeconds: rateLimit.waitSeconds
    };
  }

  // 2. Verificar patrones de spam
  if (detectSpamPattern(messageText)) {
    return {
      isSpam: true,
      reason: 'Patrón de spam detectado',
      action: 'spam_pattern'
    };
  }

  // 3. Verificar mensajes repetidos
  const repeated = detectRepeatedMessages(phone, messageText);
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
function cleanupExpiredHistory() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 horas

  for (const [key, value] of messageHistory.entries()) {
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
        messageHistory.delete(key);
      } else {
        messageHistory.set(key, filtered);
      }
    }
  }
}

// Limpiar historial cada hora
setInterval(cleanupExpiredHistory, 60 * 60 * 1000);

export { analyzeMessage, detectSpamPattern, checkRateLimit };

