# 🗄️ Configurar Base de Datos con Supabase

## ✅ Supabase usa PostgreSQL

Supabase es una base de datos PostgreSQL en la nube. Tu `DATABASE_URL` debe apuntar a tu proyecto de Supabase.

---

## 🔑 Paso 1: Obtener DATABASE_URL de Supabase

1. Ve a tu proyecto en [Supabase](https://supabase.com/dashboard)
2. Ve a **Settings** → **Database**
3. Busca la sección **Connection string** o **Connection pooling**
4. Copia la **URI** o **Connection string**

**Formato típico:**
```
postgresql://postgres:[YOUR-PASSWORD]@db.fnpzoqjnisgkhgnlwzic.supabase.co:5432/postgres
```

**O con pooling:**
```
postgresql://postgres.fnpzoqjnisgkhgnlwzic:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

---

## ⚙️ Paso 2: Configurar DATABASE_URL en el .env

En `server/.env` de tu VPS:

```env
# DATABASE_URL de Supabase (reemplaza [YOUR-PASSWORD] con tu contraseña real)
DATABASE_URL="postgresql://postgres:TU_CONTRASEÑA_DE_SUPABASE@db.fnpzoqjnisgkhgnlwzic.supabase.co:5432/postgres?schema=public"

# O si usas pooling (recomendado para producción):
DATABASE_URL="postgresql://postgres.fnpzoqjnisgkhgnlwzic:TU_CONTRASEÑA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?schema=public&pgbouncer=true"
```

---

## 🔐 Paso 3: Obtener tu Contraseña de Supabase

### Si no la recuerdas:

1. Ve a **Settings** → **Database** en Supabase
2. Busca la sección **Database Password**
3. Puedes:
   - **Ver la contraseña actual** (si la tienes guardada)
   - **Resetear la contraseña** (crea una nueva)

### Resetear contraseña:

1. En **Settings** → **Database** → **Database Password**
2. Click en **Reset Database Password**
3. Copia la nueva contraseña (solo se muestra una vez)

---

## ✅ Paso 4: Configurar en la VPS

```bash
cd /opt/elbuenmenu/server

# Editar .env
nano .env

# Agregar/Actualizar DATABASE_URL con tu URL de Supabase:
DATABASE_URL="postgresql://postgres:TU_CONTRASEÑA@db.fnpzoqjnisgkhgnlwzic.supabase.co:5432/postgres?schema=public"
```

---

## 📊 Paso 5: Generar Prisma Client y Ejecutar Migraciones

```bash
# Generar cliente de Prisma
npx prisma generate

# Ejecutar migraciones en Supabase
npx prisma migrate deploy

# O si es la primera vez:
npx prisma migrate dev --name init
```

---

## 🎯 Formato Final del DATABASE_URL

### Con contraseña simple:
```
postgresql://postgres:TU_CONTRASEÑA@db.fnpzoqjnisgkhgnlwzic.supabase.co:5432/postgres?schema=public
```

### Con pooling (recomendado):
```
postgresql://postgres.fnpzoqjnisgkhgnlwzic:TU_CONTRASEÑA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?schema=public&pgbouncer=true
```

---

## 🔗 Tu Proyecto Supabase

- **URL:** https://fnpzoqjnisgkhgnlwzic.supabase.co
- **Project Ref:** fnpzoqjnisgkhgnlwzic
- **Anon Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

---

## ✅ Verificar Conexión

```bash
# Probar conexión con Prisma
npx prisma db pull

# O abrir Prisma Studio para ver las tablas
npx prisma studio
```

---

¡Listo! Ahora tu backend usará Supabase como base de datos. 🎉

