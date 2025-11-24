#!/bin/bash
# Script simple para regenerar Prisma Client

cd /opt/elbuenmenu/server

echo "🔄 Regenerando Prisma Client..."

# Limpiar caché
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client

# Regenerar
npx prisma generate

echo "✅ Prisma Client regenerado"

