/**
 * Rutas para gestión de WhatsApp Multi-Sesión
 */

import express from 'express';
import { authenticateAdmin, authorize } from '../middlewares/auth.middleware.js';
import whatsappService from '../services/whatsapp-multi.service.js';

const router = express.Router();

/**
 * GET /api/whatsapp/:storeId/status
 * Obtiene el estado de conexión de WhatsApp para una tienda
 */
router.get('/:storeId/status', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    // Verificar que el admin tiene acceso a esta tienda
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    const status = whatsappService.getSessionStatus(storeId);
    res.json(status);

  } catch (error) {
    console.error('Error obteniendo estado de WhatsApp:', error);
    res.status(500).json({ error: 'Error obteniendo estado' });
  }
});

/**
 * POST /api/whatsapp/:storeId/connect
 * Inicia el proceso de conexión (genera QR)
 */
router.post('/:storeId/connect', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    const result = await whatsappService.getOrCreateSession(storeId);
    res.json(result);

  } catch (error) {
    console.error('Error conectando WhatsApp:', error);
    res.status(500).json({ error: 'Error iniciando conexión' });
  }
});

/**
 * GET /api/whatsapp/:storeId/qr
 * Obtiene el código QR actual (si hay uno pendiente)
 */
router.get('/:storeId/qr', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    const qr = whatsappService.getPendingQR(storeId);
    
    if (!qr) {
      return res.json({ qr: null, message: 'No hay QR pendiente' });
    }

    res.json({ qr });

  } catch (error) {
    console.error('Error obteniendo QR:', error);
    res.status(500).json({ error: 'Error obteniendo QR' });
  }
});

/**
 * POST /api/whatsapp/:storeId/disconnect
 * Desconecta la sesión de WhatsApp
 */
router.post('/:storeId/disconnect', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    const result = await whatsappService.disconnectSession(storeId);
    res.json(result);

  } catch (error) {
    console.error('Error desconectando WhatsApp:', error);
    res.status(500).json({ error: 'Error desconectando' });
  }
});

/**
 * POST /api/whatsapp/:storeId/send
 * Envía un mensaje de WhatsApp
 */
router.post('/:storeId/send', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const { to, message } = req.body;
    
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    if (!to || !message) {
      return res.status(400).json({ error: 'Se requiere destinatario y mensaje' });
    }

    const result = await whatsappService.sendMessage(storeId, to, message);
    res.json(result);

  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: error.message || 'Error enviando mensaje' });
  }
});

/**
 * POST /api/whatsapp/:storeId/test
 * Envía un mensaje de prueba al número configurado
 */
router.post('/:storeId/test', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    // Obtener número de la configuración
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings?.whatsappBotNumber) {
      return res.status(400).json({ error: 'No hay número de WhatsApp configurado' });
    }

    const testMessage = '✅ ¡Conexión exitosa! Este es un mensaje de prueba de ElBuenMenu.';
    const result = await whatsappService.sendMessage(storeId, settings.whatsappBotNumber, testMessage);
    
    res.json({ ...result, message: 'Mensaje de prueba enviado' });

  } catch (error) {
    console.error('Error enviando mensaje de prueba:', error);
    res.status(500).json({ error: error.message || 'Error enviando mensaje de prueba' });
  }
});

export default router;

