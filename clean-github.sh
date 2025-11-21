#!/bin/bash

# Script para limpiar archivos del repositorio Git

echo "🧹 Limpiando repositorio Git..."

# Eliminar archivos de documentación (excepto README.md principal)
echo "📚 Eliminando documentación..."
git rm -r --cached *.md 2>/dev/null || true
git rm -r --cached database/*.md 2>/dev/null || true
git rm -r --cached server/*.md 2>/dev/null || true

# Eliminar archivos de configuración innecesarios
echo "⚙️ Eliminando configs innecesarios..."
git rm --cached netlify.toml 2>/dev/null || true
git rm --cached vercel.json 2>/dev/null || true
git rm --cached nginx.conf.example 2>/dev/null || true
git rm --cached deploy.sh 2>/dev/null || true
git rm --cached ecosystem.config.js 2>/dev/null || true
git rm --cached auto-imports.d.ts 2>/dev/null || true

# Eliminar directorios temporales
echo "🗑️ Eliminando directorios temporales..."
git rm -r --cached asdasd/ 2>/dev/null || true
git rm --cached out/kk.zip 2>/dev/null || true

# Eliminar build del frontend
echo "📦 Eliminando build del frontend..."
git rm -r --cached out/ 2>/dev/null || true

# Mantener README.md principal
git checkout HEAD -- README.md 2>/dev/null || true

echo "✅ Archivos marcados para eliminación!"
echo ""
echo "📝 Para completar la limpieza, ejecuta:"
echo "   git commit -m 'Clean: Eliminar archivos innecesarios'"
echo "   git push"

