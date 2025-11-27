#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authPath = path.join(__dirname, 'auth');

try {
    if (fs.existsSync(authPath)) {
        fs.emptyDirSync(authPath);
        console.log('✅ Sesión limpiada correctamente');
        console.log('💡 Ahora puedes reiniciar el bot con "npm start" para generar un nuevo QR');
    } else {
        console.log('⚠️ Carpeta auth no existe');
    }
} catch (error) {
    console.error('❌ Error al limpiar sesión:', error.message);
    process.exit(1);
}

