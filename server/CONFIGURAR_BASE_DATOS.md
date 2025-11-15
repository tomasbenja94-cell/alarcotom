# 🗄️ Configurar Base de Datos PostgreSQL

## 🔍 Paso 1: Verificar si ya tienes PostgreSQL instalado

```bash
# Verificar si PostgreSQL está instalado
psql --version

# O intentar conectarte
sudo -u postgres psql
```

Si te conecta, significa que PostgreSQL está instalado.

---

## 📝 Paso 2: Crear Base de Datos y Usuario (si no los tienes)

### Opción A: Desde la línea de comandos

```bash
# 1. Conectarte como usuario postgres
sudo -u postgres psql

# 2. Crear base de datos
CREATE DATABASE elbuenmenu;

# 3. Crear usuario
CREATE USER elbuenmenu_user WITH PASSWORD 'tu_contraseña_segura_aqui';

# 4. Dar permisos al usuario
GRANT ALL PRIVILEGES ON DATABASE elbuenmenu TO elbuenmenu_user;

# 5. Conectarte a la base de datos y dar permisos al schema
\c elbuenmenu
GRANT ALL ON SCHEMA public TO elbuenmenu_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO elbuenmenu_user;

# 6. Salir
\q
```

### Opción B: Si ya tienes un usuario PostgreSQL

Puedes usar el usuario `postgres` directamente (menos recomendado por seguridad):

```bash
sudo -u postgres psql
CREATE DATABASE elbuenmenu;
\q
```

---

## ⚙️ Paso 3: Configurar DATABASE_URL en el .env

Después de crear la base de datos y usuario, configura en `server/.env`:

### Si creaste un usuario específico:
```env
DATABASE_URL="postgresql://elbuenmenu_user:tu_contraseña_segura_aqui@localhost:5432/elbuenmenu?schema=public"
```

### Si usas el usuario postgres (no recomendado para producción):
```env
DATABASE_URL="postgresql://postgres:password_postgres@localhost:5432/elbuenmenu?schema=public"
```

**Para encontrar la contraseña del usuario postgres:**
```bash
# La contraseña se configuró cuando instalaste PostgreSQL
# O puedes cambiarla:
sudo -u postgres psql
ALTER USER postgres PASSWORD 'nueva_contraseña';
\q
```

---

## 🗃️ Opción Alternativa: Usar SQLite (más fácil)

Si no quieres configurar PostgreSQL, puedes usar SQLite:

```env
DATABASE_URL="file:./prisma/prod.db"
```

**Ventajas:**
- ✅ No necesita instalación
- ✅ Más simple para empezar
- ✅ Funciona perfectamente para proyectos pequeños

**Desventajas:**
- ⚠️ No recomendado para producción con mucho tráfico
- ⚠️ No soporta conexiones simultáneas tan bien como PostgreSQL

---

## 🔐 Ejemplo de Credenciales Comunes

### Escenario 1: PostgreSQL recién instalado
```
Usuario: postgres
Contraseña: (la que configuraste al instalar PostgreSQL)
```

### Escenario 2: Usuario personalizado
```
Usuario: elbuenmenu_user
Contraseña: tu_contraseña_segura_aqui
Base de datos: elbuenmenu
Host: localhost
Puerto: 5432
```

---

## ✅ Paso 4: Verificar que funciona

```bash
cd /opt/elbuenmenu/server

# Generar cliente de Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate deploy

# Verificar que se crearon las tablas
npx prisma studio
# Esto abre una interfaz web en http://localhost:5555
```

---

## 🆘 Si no recuerdas tu contraseña de PostgreSQL

```bash
# Opción 1: Resetear contraseña del usuario postgres
sudo -u postgres psql
ALTER USER postgres PASSWORD 'nueva_contraseña';
\q

# Opción 2: Cambiar configuración para permitir acceso sin contraseña (temporal)
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Cambiar todas las líneas de "md5" a "trust"
sudo systemctl restart postgresql

# Luego cambiar la contraseña y volver a poner "md5"
```

---

## 📋 Resumen - DATABASE_URL según tu caso

### PostgreSQL con usuario personalizado:
```
DATABASE_URL="postgresql://elbuenmenu_user:tu_contraseña@localhost:5432/elbuenmenu?schema=public"
```

### PostgreSQL con usuario postgres:
```
DATABASE_URL="postgresql://postgres:tu_contraseña@localhost:5432/elbuenmenu?schema=public"
```

### SQLite (más fácil):
```
DATABASE_URL="file:./prisma/prod.db"
```

---

¡Con esto ya sabes qué poner en el DATABASE_URL! 🎉

