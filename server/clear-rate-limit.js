// Script para limpiar el rate limiting bloqueado
// Ejecutar: node clear-rate-limit.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearRateLimit() {
  console.log('🧹 Limpiando rate limiting...');
  
  // El rate limiting está en memoria, así que necesitamos reiniciar el servidor
  // Pero podemos crear un endpoint para limpiar el store
  console.log('⚠️  Para limpiar el rate limiting, reinicia el servidor backend.');
  console.log('💡 O espera 1 hora para que expire automáticamente.');
  
  await prisma.$disconnect();
}

clearRateLimit();

