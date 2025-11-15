#!/usr/bin/env node

import { startPanel } from './src/panel.js';

console.log('🚀 Iniciando sistema completo...');
console.log('');
console.log('📱 Bot de WhatsApp: Ejecutar "npm start" en otra terminal');
console.log('📊 Panel de control: Iniciando...');
console.log('');

// Iniciar panel de control
startPanel();

console.log('✅ Sistema iniciado correctamente');
console.log('');
console.log('📋 URLs disponibles:');
console.log('   Panel: http://localhost:3000');
console.log('   API: http://localhost:3000/api/pedidos');
console.log('');
console.log('💡 Para iniciar el bot de WhatsApp:');
console.log('   npm start');
console.log('');