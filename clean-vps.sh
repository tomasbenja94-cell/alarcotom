#!/bin/bash

# Script para limpiar la VPS - Solo mantener backend y bot

echo "🧹 Limpiando VPS..."

# Directorio donde está el proyecto
PROJECT_DIR="/opt/elbuenmenu"

cd $PROJECT_DIR || exit

# Eliminar frontend (src, build, etc.)
echo "📦 Eliminando frontend..."
rm -rf src/
rm -rf out/
rm -rf dist/
rm -rf build/
rm -rf node_modules/
rm -f package.json
rm -f package-lock.json
rm -f vite.config.ts
rm -f tsconfig*.json
rm -f tailwind.config.ts
rm -f postcss.config.ts
rm -f index.html

# Eliminar documentación
echo "📚 Eliminando documentación..."
rm -f *.md
rm -rf database/
rm -rf prisma/

# Eliminar archivos de configuración innecesarios
echo "⚙️ Eliminando configs innecesarios..."
rm -f netlify.toml
rm -f vercel.json
rm -f nginx.conf.example
rm -f deploy.sh
rm -f ecosystem.config.js
rm -f auto-imports.d.ts

# Eliminar directorios temporales
echo "🗑️ Eliminando directorios temporales..."
rm -rf asdasd/
rm -f kk.zip

# Eliminar supabase functions (si no se usan en VPS)
echo "☁️ Eliminando Supabase functions..."
rm -rf supabase/

# Mantener solo:
# - server/
# - whatsapp-bot/
# - .env
# - .git (para actualizaciones)
# - env.example.txt (referencia)

echo "✅ Limpieza completada!"
echo ""
echo "📁 Estructura final en VPS:"
ls -la

