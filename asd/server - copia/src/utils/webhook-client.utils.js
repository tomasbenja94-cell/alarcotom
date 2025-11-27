import crypto from 'crypto';

// ========== CLIENTE PARA ENVIAR WEBHOOKS CON FIRMA HMAC ==========

/**
 * Enviar webhook con firma HMAC
 * @param {string} url - URL del webhook
 * @param {object} payload - Datos a enviar
 * @param {string} secret - Secreto para firmar
 * @returns {Promise<Response>}
 */
export async function sendWebhookWithSignature(url, payload, secret) {
  const timestamp = Date.now().toString();
  const payloadString = JSON.stringify(payload);

  // Calcular firma HMAC
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${payloadString}`)
    .digest('hex');

  // Enviar con firma y timestamp
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Timestamp': timestamp
    },
    body: payloadString
  });

  return response;
}

/**
 * Enviar webhook con API key (alternativa simple)
 * @param {string} url - URL del webhook
 * @param {object} payload - Datos a enviar
 * @param {string} apiKey - API key para autenticación
 * @returns {Promise<Response>}
 */
export async function sendWebhookWithApiKey(url, payload, apiKey) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify(payload)
  });

  return response;
}

/**
 * Enviar webhook con idempotency key
 * @param {string} url - URL del webhook
 * @param {object} payload - Datos a enviar
 * @param {string} idempotencyKey - Key de idempotencia
 * @param {string} apiKey - API key (opcional)
 * @returns {Promise<Response>}
 */
export async function sendWebhookWithIdempotency(url, payload, idempotencyKey, apiKey = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return response;
}

