/**
 * Script para verificar y aprobar pagos pendientes de Mercado Pago
 * 
 * Uso:
 * node server/scripts/check-mercadopago-payments.js
 * 
 * O para un pedido específico:
 * node server/scripts/check-mercadopago-payments.js #0006
 */

import { PrismaClient } from '@prisma/client';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Cargar configuración de Mercado Pago
async function getMercadoPagoConfig() {
  try {
    // Intentar cargar desde variables de entorno
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    
    if (!accessToken) {
      // Intentar cargar desde la base de datos
      const setting = await prisma.setting.findUnique({
        where: { key: 'mercado_pago_access_token' }
      });
      
      if (setting && setting.value) {
        return {
          accessToken: setting.value,
          publicKey: null
        };
      }
    }
    
    return accessToken ? { accessToken, publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || null } : null;
  } catch (error) {
    console.error('Error cargando configuración de Mercado Pago:', error);
    return null;
  }
}

async function checkAndApprovePayments(orderNumberFilter = null) {
  try {
    console.log('🔍 Iniciando verificación de pagos de Mercado Pago...\n');
    
    // Cargar configuración de Mercado Pago
    const mpConfig = await getMercadoPagoConfig();
    
    if (!mpConfig || !mpConfig.accessToken) {
      console.error('❌ Mercado Pago no está configurado');
      console.log('💡 Configura MERCADOPAGO_ACCESS_TOKEN en las variables de entorno o en la base de datos');
      return;
    }
    
    const mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: mpConfig.accessToken
    });
    
    const paymentClient = new Payment(mercadoPagoConfig);
    
    // Buscar pedidos pendientes de Mercado Pago
    const whereClause = {
      paymentMethod: 'Mercado Pago',
      paymentStatus: 'pending',
      status: 'pending'
    };
    
    if (orderNumberFilter) {
      whereClause.orderNumber = orderNumberFilter;
    }
    
    const pendingOrders = await prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        customerPhone: true,
        total: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`📋 Encontrados ${pendingOrders.length} pedidos pendientes de Mercado Pago\n`);
    
    if (pendingOrders.length === 0) {
      console.log('✅ No hay pedidos pendientes para verificar');
      return;
    }
    
    let approvedCount = 0;
    let notFoundCount = 0;
    let pendingCount = 0;
    
    for (const order of pendingOrders) {
      console.log(`\n🔍 Verificando pedido ${order.orderNumber}...`);
      
      try {
        // Buscar pagos en Mercado Pago usando el external_reference (orderNumber)
        // Nota: La API de Mercado Pago no tiene un endpoint directo para buscar por external_reference
        // Necesitamos buscar en los pagos recientes o usar otro método
        
        // Intentar buscar pagos recientes (últimas 24 horas)
        const searchParams = {
          external_reference: order.orderNumber,
          status: 'approved'
        };
        
        // La API de Mercado Pago requiere usar el endpoint de búsqueda
        // Pero la SDK puede no tenerlo directamente, así que intentamos otra aproximación
        
        // Buscar pagos aprobados recientemente que puedan corresponder a este pedido
        // Como alternativa, podemos verificar si hay pagos con este external_reference
        // usando la API REST directamente
        
        const response = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${order.orderNumber}&status=approved`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${mpConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const searchResult = await response.json();
          
          if (searchResult.results && searchResult.results.length > 0) {
            // Encontramos un pago aprobado para este pedido
            const payment = searchResult.results[0];
            
            console.log(`✅ Pago encontrado y aprobado para ${order.orderNumber}`);
            console.log(`   Payment ID: ${payment.id}`);
            console.log(`   Amount: $${payment.transaction_amount}`);
            console.log(`   Date approved: ${payment.date_approved}`);
            
            // Actualizar el pedido
            await prisma.order.update({
              where: { id: order.id },
              data: {
                status: 'confirmed',
                paymentStatus: 'approved'
              }
            });
            
            console.log(`✅ Pedido ${order.orderNumber} actualizado a confirmed/approved`);
            
            // Notificar al cliente vía WhatsApp (si está configurado)
            if (order.customerPhone) {
              try {
                const botWebhookUrl = process.env.BOT_WEBHOOK_URL || 'http://localhost:3001';
                const notifyUrl = botWebhookUrl.endsWith('/') 
                  ? `${botWebhookUrl}notify-payment` 
                  : `${botWebhookUrl}/notify-payment`;
                
                await fetch(notifyUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    phone: order.customerPhone,
                    message: `✅ *PAGO APROBADO*\n\n💰 Tu pago de Mercado Pago fue aprobado correctamente.\n\n🍳 Tu pedido está en preparación.\n\n⏱️ Tiempo estimado: 30-45 minutos\n\n¡Te avisamos cuando esté listo! 🚚`
                  })
                });
                
                console.log(`📱 Cliente ${order.customerPhone} notificado`);
              } catch (notifyError) {
                console.warn(`⚠️ No se pudo notificar al cliente: ${notifyError.message}`);
              }
            }
            
            approvedCount++;
          } else {
            console.log(`⏳ No se encontró pago aprobado para ${order.orderNumber}`);
            pendingCount++;
          }
        } else {
          console.warn(`⚠️ Error al buscar pagos: ${response.status} ${response.statusText}`);
          pendingCount++;
        }
      } catch (error) {
        console.error(`❌ Error verificando pedido ${order.orderNumber}:`, error.message);
        notFoundCount++;
      }
    }
    
    console.log(`\n\n📊 Resumen:`);
    console.log(`✅ Pagos aprobados: ${approvedCount}`);
    console.log(`⏳ Pendientes: ${pendingCount}`);
    console.log(`❌ Errores: ${notFoundCount}`);
    
  } catch (error) {
    console.error('❌ Error general:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
const orderNumberFilter = process.argv[2] || null;
checkAndApprovePayments(orderNumberFilter)
  .then(() => {
    console.log('\n✅ Script completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });

