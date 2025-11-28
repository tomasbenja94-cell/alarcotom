#!/bin/bash
# Script para configurar PM2 para que el bot esté siempre activo 24/7

echo "🔧 Configurando PM2 para reinicio automático..."

# Ir al directorio del servidor
cd /opt/elbuenmenu/server

# Detener procesos existentes si están corriendo
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Iniciar el backend con PM2 usando el archivo de configuración
# Usar ecosystem.config.cjs si existe (más compatible), sino usar ecosystem.config.js
if [ -f "ecosystem.config.cjs" ]; then
  echo "📋 Usando ecosystem.config.cjs"
  pm2 start ecosystem.config.cjs
elif [ -f "ecosystem.config.js" ]; then
  echo "📋 Usando ecosystem.config.js"
  pm2 start ecosystem.config.js
else
  echo "❌ No se encontró archivo de configuración de PM2"
  echo "📋 Iniciando manualmente..."
  pm2 start index.js --name backend --cwd /opt/elbuenmenu/server
fi

# Configurar PM2 para que se inicie automáticamente al reiniciar el servidor
pm2 startup
pm2 save

# Verificar estado
echo ""
echo "✅ Estado de PM2:"
pm2 status

echo ""
echo "📋 Para ver los logs:"
echo "   pm2 logs backend"
echo ""
echo "📋 Para reiniciar:"
echo "   pm2 restart backend"
echo ""
echo "✅ El bot de WhatsApp se iniciará automáticamente cuando el backend arranque"
echo "✅ PM2 reiniciará automáticamente el backend si se cae"
echo "✅ El bot se reconectará automáticamente si se desconecta"

