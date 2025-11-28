#!/bin/bash
# Script para agregar JWT_DRIVER_SECRET al archivo .env

SECRET="C41kZSKvPkUxgGEVnfsFD8se+0hDULyDCkKoZur8WuLi7AdrepHSR712w2iXdLd5
VgK7JH0ypSzXnntJp9pSxA=="

# Verificar si JWT_DRIVER_SECRET ya existe
if grep -q "JWT_DRIVER_SECRET" .env; then
    echo "⚠️  JWT_DRIVER_SECRET ya existe en .env"
    echo "¿Deseas reemplazarlo? (s/n)"
    read -r response
    if [[ "$response" == "s" || "$response == "S" ]]; then
        # Eliminar la línea existente
        sed -i '/^JWT_DRIVER_SECRET=/d' .env
        echo "✅ Línea antigua eliminada"
    else
        echo "❌ Operación cancelada"
        exit 1
    fi
fi

# Agregar JWT_DRIVER_SECRET al final del archivo
echo "" >> .env
echo "# JWT Secret para tokens de repartidores" >> .env
echo "JWT_DRIVER_SECRET=$SECRET" >> .env

echo "✅ JWT_DRIVER_SECRET agregado al archivo .env"
echo "📋 Verificando..."
grep JWT_DRIVER_SECRET .env

