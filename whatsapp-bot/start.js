#!/usr/bin/env node

// Este archivo ya no se usa - el bot ahora se maneja desde server/src/services/whatsapp-multi.service.js
// El sistema multi-tenant maneja todas las sesiones desde el backend

console.log('⚠️  Este archivo ya no se usa.');
console.log('📱 El bot de WhatsApp ahora se gestiona desde el admin panel.');
console.log('🌐 Accede a: /admin?store=TU_STORE_ID y ve a la sección "WhatsApp"');
console.log('');
console.log('💡 Recomendación: Detén este proceso en PM2 con: pm2 stop bot');
console.log('   El bot ahora se ejecuta desde el backend automáticamente.');
console.log('');

// Mantener el proceso vivo para evitar reinicios constantes de PM2
// El usuario debería detener este proceso manualmente
setInterval(() => {
  // Proceso inactivo, solo mantiene vivo el proceso
}, 60000); // Check cada minuto