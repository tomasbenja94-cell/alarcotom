# 📤 Subir Frontend por CPANEL

## 🔨 Paso 1: Construir el Frontend Localmente

En tu PC local, ejecuta:

```bash
# 1. Asegúrate de estar en la raíz del proyecto
cd C:\Users\kiosc\OneDrive\Desktop\whatsappkevein

# 2. Instalar dependencias (si no las tienes)
npm install

# 3. Crear archivo .env.production con las variables de producción
# Crea un archivo .env.production en la raíz con:
```

**Contenido del archivo `.env.production`:**
```
VITE_API_URL=https://elbuenmenu.store/api
VITE_PUBLIC_SUPABASE_URL=https://fnpzoqjnisgkhgnlwzic.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucHpvcWpuaXNna2hnbmx3emljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTY1NTcsImV4cCI6MjA3Njk5MjU1N30.29Ye8_bIx8Fdm41FHSWhLOXpLI7G6qgHiVdGTxFARwY
```

```bash
# 4. Construir el proyecto para producción
npm run build
```

Esto creará una carpeta `out/` con todos los archivos listos para subir.

---

## 📂 Paso 2: Qué Subir por CPANEL

**Sube TODO el contenido de la carpeta `out/`** a tu hosting por CPANEL:

### Estructura en CPANEL:
```
public_html/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ... (otros archivos)
└── ... (otros archivos estáticos)
```

**IMPORTANTE:**
- Sube **TODOS los archivos y carpetas** dentro de `out/`
- Si tu dominio es `elbuenmenu.store`, súbelos a `public_html/`
- Si tienes un subdirectorio, súbelos ahí

---

## 🔧 Paso 3: Configurar .htaccess (CPANEL)

Crea un archivo `.htaccess` en `public_html/` con esto:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Compresión GZIP
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Cache de archivos estáticos
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/gif "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
</IfModule>
```

Esto permite que React Router funcione correctamente (SPA routing).

---

## ✅ Paso 4: Verificar

1. Ve a `https://elbuenmenu.store`
2. Verifica que cargue correctamente
3. Prueba navegar entre páginas (menú, checkout, etc.)
4. Verifica que se conecte al backend correctamente

---

## 🔄 Actualizar el Frontend (cuando hagas cambios)

Siempre que hagas cambios:

```bash
# 1. En tu PC local
npm run build

# 2. Sube TODO el contenido nuevo de la carpeta out/ por CPANEL
# (Sobrescribe los archivos antiguos)
```

---

## 📝 Notas Importantes

- **Variables de entorno**: Se compilan en el build, así que si cambias variables, debes hacer `npm run build` de nuevo
- **CORS**: El backend ya está configurado para permitir `elbuenmenu.store`
- **HTTPS**: Asegúrate de que tu hosting tenga SSL activado (Let's Encrypt gratis en CPANEL)

---

¡Listo! Tu frontend estará en producción. 🎉

