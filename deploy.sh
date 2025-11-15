#!/bin/bash
# Script de Deployment para VPS
# Uso: ./deploy.sh

set -e  # Salir si hay algún error

echo "🚀 Iniciando deployment de El Buen Menú..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Ruta del proyecto (ajustar si es diferente)
PROJECT_PATH="/root/whatsappkevein"
cd "$PROJECT_PATH" || exit 1

echo -e "${YELLOW}📦 Actualizando código desde Git...${NC}"
git pull origin main || echo "⚠️  No se pudo hacer git pull (¿no usas Git?)"

echo -e "${YELLOW}📦 Instalando dependencias del Backend...${NC}"
cd server
npm install --production

echo -e "${YELLOW}📦 Ejecutando migraciones de Prisma...${NC}"
npx prisma generate
npx prisma migrate deploy || echo "⚠️  No se pudieron ejecutar migraciones"

echo -e "${YELLOW}🔄 Reiniciando Backend...${NC}"
pm2 restart backend-elbuenmenu || pm2 start ecosystem.config.js --only backend-elbuenmenu

cd ..

echo -e "${YELLOW}📦 Instalando dependencias del Bot...${NC}"
cd whatsapp-bot
npm install --production

echo -e "${YELLOW}🔄 Reiniciando WhatsApp Bot...${NC}"
pm2 restart whatsapp-bot-elbuenmenu || pm2 start ecosystem.config.js --only whatsapp-bot-elbuenmenu

cd ..

echo -e "${YELLOW}📦 Instalando dependencias del Frontend...${NC}"
npm install

echo -e "${YELLOW}🏗️  Compilando Frontend...${NC}"
npm run build

echo -e "${YELLOW}📤 Copiando archivos estáticos...${NC}"
sudo cp -r dist/* /var/www/elbuenmenu/public/ || echo "⚠️  No se pudo copiar al directorio web (ajustar ruta)"

echo -e "${YELLOW}🔐 Ajustando permisos...${NC}"
sudo chown -R www-data:www-data /var/www/elbuenmenu || echo "⚠️  No se pudieron ajustar permisos"

echo -e "${GREEN}✅ Deployment completado!${NC}"
echo ""
echo -e "${YELLOW}📊 Estado de PM2:${NC}"
pm2 status

echo ""
echo -e "${GREEN}✨ ¡Listo! Tu aplicación está actualizada.${NC}"

