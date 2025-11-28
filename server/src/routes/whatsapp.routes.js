/**
 * Rutas para gestión de WhatsApp Multi-Sesión
 */

import express from 'express';
import { authenticateAdmin } from '../middlewares/auth.middleware.js';
import whatsappService from '../services/whatsapp-multi.service.js';

const router = express.Router();

/**
 * GET /api/whatsapp/:storeId/status
 * Obtiene el estado de conexión de WhatsApp para una tienda
 */
router.get('/:storeId/status', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    
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

    const result = await whatsappService.startWhatsAppSession(storeId);
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

    // Obtener QR
    let qr = whatsappService.getPendingQR(storeId);
    
    // Si no hay QR pero el estado es pending_qr, intentar iniciar sesión para generar uno nuevo
    if (!qr) {
      const status = whatsappService.getSessionStatus(storeId);
      console.log(`[WhatsApp QR] [${storeId}] Estado actual: ${status.status}, QR disponible: ${qr ? 'Sí' : 'No'}`);
      
      if (status.status === 'pending_qr' || status.status === 'disconnected') {
        console.log(`[WhatsApp QR] [${storeId}] Iniciando sesión para generar nuevo QR...`);
        // Iniciar sesión para generar nuevo QR
        await whatsappService.startWhatsAppSession(storeId);
        // Esperar un momento para que se genere el QR
        await new Promise(resolve => setTimeout(resolve, 3000));
        qr = whatsappService.getPendingQR(storeId);
        console.log(`[WhatsApp QR] [${storeId}] QR después de iniciar sesión: ${qr ? 'Disponible' : 'No disponible'}`);
      }
    } else {
      console.log(`[WhatsApp QR] [${storeId}] QR encontrado (${qr.substring(0, 30)}...)`);
    }
    
    if (!qr) {
      console.log(`[WhatsApp QR] [${storeId}] No hay QR disponible`);
      return res.json({ qr: null, message: 'No hay QR pendiente. Intenta hacer "Generar QR" primero.' });
    }

    res.json({ qr });

  } catch (error) {
    console.error(`[WhatsApp QR] [${req.params.storeId}] Error obteniendo QR:`, error);
    res.status(500).json({ error: 'Error obteniendo QR', details: error.message });
  }
});

/**
 * POST /api/whatsapp/:storeId/disconnect
 * Desconecta la sesión de WhatsApp y limpia todo (QR, sesión, archivos)
 */
router.post('/:storeId/disconnect', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }

    console.log(`[WhatsApp Disconnect] [${storeId}] Desconectando y limpiando sesión...`);
    const result = await whatsappService.disconnectSession(storeId);
    
    // Asegurar que el estado se actualice a disconnected
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.storeSettings.upsert({
      where: { storeId },
      update: { 
        whatsappSessionStatus: 'disconnected', 
        whatsappConnectedNumber: null 
      },
      create: { 
        storeId, 
        whatsappSessionStatus: 'disconnected' 
      }
    });
    await prisma.$disconnect();
    
    console.log(`[WhatsApp Disconnect] [${storeId}] Sesión eliminada completamente`);
    res.json({ ...result, message: 'Sesión desconectada y eliminada completamente' });

  } catch (error) {
    console.error(`[WhatsApp Disconnect] [${req.params.storeId}] Error:`, error);
    res.status(500).json({ error: 'Error desconectando', details: error.message });
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

    const result = await whatsappService.sendMessageToClient(storeId, to, message);
    res.json(result);

  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: error.message || 'Error enviando mensaje' });
  }
});

// Protección contra múltiples llamadas simultáneas al test
const testInProgress = new Map(); // storeId -> timestamp

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

    // Evitar múltiples llamadas simultáneas (cooldown de 5 segundos)
    const lastTest = testInProgress.get(storeId);
    if (lastTest && Date.now() - lastTest < 5000) {
      return res.status(429).json({ 
        error: 'Espera unos segundos antes de enviar otro mensaje de prueba',
        retryAfter: Math.ceil((5000 - (Date.now() - lastTest)) / 1000)
      });
    }
    
    testInProgress.set(storeId, Date.now());

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const settings = await prisma.storeSettings.findUnique({
      where: { storeId }
    });

    if (!settings?.whatsappBotNumber) {
      testInProgress.delete(storeId);
      return res.status(400).json({ error: 'No hay número de WhatsApp configurado' });
    }

    const testMessage = '✅ ¡Conexión exitosa! Este es un mensaje de prueba de Negocios App.';
    const result = await whatsappService.sendMessageToClient(storeId, settings.whatsappBotNumber, testMessage);
    
    // Limpiar después de 5 segundos
    setTimeout(() => {
      testInProgress.delete(storeId);
    }, 5000);
    
    res.json({ ...result, message: 'Mensaje de prueba enviado' });

  } catch (error) {
    console.error('Error enviando mensaje de prueba:', error);
    testInProgress.delete(req.params.storeId);
    res.status(500).json({ error: error.message || 'Error enviando mensaje de prueba' });
  }
});

router.post('/:storeId/reload-config', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }
    const result = await whatsappService.reloadStoreConfig(storeId);
    res.json(result);
  } catch (error) {
    console.error('Error recargando configuración:', error);
    res.status(500).json({ error: 'No se pudo recargar la configuración' });
  }
});

router.post('/:storeId/restart', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }
    // Desconectar y reconectar
    await whatsappService.disconnectSession(storeId);
    const result = await whatsappService.startWhatsAppSession(storeId);
    res.json(result);
  } catch (error) {
    console.error('Error reiniciando bot:', error);
    res.status(500).json({ error: 'No se pudo reiniciar el bot' });
  }
});

router.post('/:storeId/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled debe ser booleano' });
    }
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }
    
    if (enabled) {
      const result = await whatsappService.startWhatsAppSession(storeId);
      res.json(result);
    } else {
      const result = await whatsappService.disconnectSession(storeId);
      res.json(result);
    }
  } catch (error) {
    console.error('Error cambiando estado del bot:', error);
    res.status(500).json({ error: 'No se pudo cambiar el estado del bot' });
  }
});

router.get('/:storeId/metrics', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }
    // Métricas básicas
    const status = whatsappService.getSessionStatus(storeId);
    res.json({
      connected: status.status === 'connected',
      messagesProcessed: 0,
      errors: 0,
      lastActivity: status.connectedAt || null
    });
  } catch (error) {
    console.error('Error obteniendo métricas:', error);
    res.status(500).json({ error: 'No se pudieron obtener las métricas' });
  }
});

router.get('/:storeId/logs', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    if (req.user.role !== 'super_admin' && req.user.storeId !== storeId) {
      return res.status(403).json({ error: 'No tienes acceso a esta tienda' });
    }
    
    // Importar la función de logs
    const { getBotLogs } = await import('../services/whatsapp-multi.service.js');
    const logs = getBotLogs(storeId, limit);
    
    res.json({ logs });
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    res.status(500).json({ error: 'No se pudieron obtener los logs' });
  }
});

export default router;
