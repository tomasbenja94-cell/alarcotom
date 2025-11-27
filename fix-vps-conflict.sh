#!/bin/bash

# Script para resolver conflictos de git en el VPS
# Ejecutar en el servidor: bash fix-vps-conflict.sh

cd /opt/elbuenmenu || exit 1

echo "🔍 Verificando cambios locales..."

# Ver cambios en package.json
if git diff --quiet server/package.json; then
    echo "✅ No hay cambios en server/package.json"
else
    echo "⚠️  Hay cambios en server/package.json:"
    git diff server/package.json
    echo ""
    read -p "¿Guardar estos cambios? (s/n): " guardar
    if [ "$guardar" = "s" ]; then
        git stash save "Cambios locales en package.json $(date +%Y-%m-%d)"
        echo "✅ Cambios guardados en stash"
    else
        git checkout -- server/package.json
        echo "✅ Cambios descartados"
    fi
fi

# Manejar panel.js
if [ -f "whatsapp-bot/src/panel.js" ]; then
    echo "⚠️  Archivo panel.js existe localmente"
    read -p "¿Guardar como backup? (s/n): " backup
    if [ "$backup" = "s" ]; then
        mv whatsapp-bot/src/panel.js whatsapp-bot/src/panel.js.backup
        echo "✅ Movido a panel.js.backup"
    else
        rm whatsapp-bot/src/panel.js
        echo "✅ Archivo eliminado"
    fi
fi

# Hacer pull
echo "📥 Haciendo pull..."
git pull

if [ $? -eq 0 ]; then
    echo "✅ Pull exitoso!"
    
    # Reinstalar dependencias si hubo cambios
    if git diff HEAD@{1} HEAD --name-only | grep -q "package.json"; then
        echo "📦 Reinstalando dependencias..."
        cd server && npm install && cd ..
    fi
    
    echo "✨ Listo!"
else
    echo "❌ Error en el pull"
    exit 1
fi

