// Script para verificar qué secrets están configurados (sin mostrar los valores completos)
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🔍 Verificando configuración de secrets...\n');

const secrets = {
  'JWT_SECRET': process.env.JWT_SECRET,
  'JWT_DRIVER_SECRET': process.env.JWT_DRIVER_SECRET,
  'JWT_DRIVER_SECRET_ALT': process.env.JWT_DRIVER_SECRET_ALT,
  'JWT_REFRESH_SECRET': process.env.JWT_REFRESH_SECRET,
  'JWT_EXPIRES_IN': process.env.JWT_EXPIRES_IN || '8h'
};

Object.entries(secrets).forEach(([key, value]) => {
  if (value) {
    const preview = value.length > 20 ? value.substring(0, 20) + '...' : value;
    const length = value.length;
    console.log(`✅ ${key}: Configurado (${length} caracteres)`);
    console.log(`   Preview: ${preview}`);
  } else {
    console.log(`❌ ${key}: NO CONFIGURADO (usando valor por defecto)`);
  }
  console.log('');
});

console.log('\n📝 Si algún secret no está configurado, agrégalo al archivo .env del servidor.');
console.log('💡 Para generar un secret seguro, usa: openssl rand -base64 64');

