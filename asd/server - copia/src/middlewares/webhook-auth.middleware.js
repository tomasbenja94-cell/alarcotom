import crypto from 'crypto';

// ========== VERIFICAR FIRMA HMAC DE WEBHOOK ==========
export const verifyWebhookSignature = (secret) => {
  return (req, res, next) => {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!signature || !timestamp) {
      console.warn('Webhook sin firma o timestamp', { ip: req.ip });
      return res.status(401).json({ error: 'Firma o timestamp no proporcionados' });
    }

    // Verificar timestamp (prevenir replay attacks)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    
    if (isNaN(requestTime) || Math.abs(now - requestTime) > 300000) { // 5 minutos
      console.warn('Webhook con timestamp inválido o expirado', {
        ip: req.ip,
        timestamp,
        diff: Math.abs(now - requestTime)
      });
      return res.status(401).json({ error: 'Timestamp inválido o expirado' });
    }

    // Calcular firma esperada
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}:${payload}`)
      .digest('hex');

    // Comparar firmas (timing-safe)
    const providedSignature = Buffer.from(signature, 'hex');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');

    if (providedSignature.length !== expectedSignatureBuffer.length) {
      console.warn('Webhook con firma de longitud incorrecta', { ip: req.ip });
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const isValid = crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer);

    if (!isValid) {
      console.warn('Intento de webhook con firma inválida', {
        ip: req.ip,
        timestamp,
        expectedSignature: expectedSignature.substring(0, 10) + '...',
        providedSignature: signature.substring(0, 10) + '...'
      });
      return res.status(401).json({ error: 'Firma inválida' });
    }

    // Agregar timestamp al request para idempotencia
    req.webhookTimestamp = requestTime;
    next();
  };
};

// ========== MIDDLEWARE PARA API KEY (ALTERNATIVA SIMPLE) ==========
export const validateWebhookApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY || 'CHANGE_THIS_API_KEY';

  if (!apiKey || apiKey !== expectedKey) {
    console.warn('Intento de webhook con API key inválida', { ip: req.ip });
    return res.status(401).json({ error: 'API key inválida' });
  }

  next();
};

