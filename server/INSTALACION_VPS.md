# 🔧 Instalación del Backend en VPS

## 📝 Pasos para instalar y ejecutar el backend

### 1. Navegar al directorio del servidor

```bash
cd /opt/elbuenmenu/server
```

### 2. Instalar dependencias

```bash
npm install
```

Esto instalará todas las dependencias necesarias (express, prisma, etc.)

### 3. Generar cliente de Prisma

```bash
npx prisma generate
```

### 4. Ejecutar migraciones (si es la primera vez)

```bash
npx prisma migrate deploy
```

### 5. Verificar que el archivo .env existe

```bash
cat .env
```

Debe contener todas las variables de entorno necesarias (DATABASE_URL, JWT_SECRET, etc.)

### 6. Iniciar el servidor

#### Opción A: Directamente
```bash
npm start
```

#### Opción B: Con PM2 (Recomendado para producción)
```bash
pm2 start index.js --name backend
pm2 save
pm2 startup
```

---

## 🔍 Solución de problemas

### Error: "Cannot find package 'express'"

**Solución:** Las dependencias no están instaladas. Ejecuta:
```bash
cd /opt/elbuenmenu/server
npm install
```

### Error: "Cannot find package '@prisma/client'"

**Solución:** Genera el cliente de Prisma:
```bash
npx prisma generate
```

### Error: "Missing DATABASE_URL"

**Solución:** Crea el archivo `.env` con todas las variables necesarias:
```bash
nano .env
```

Ver `CONFIGURAR_ENV.md` para el contenido completo.

### Error: "Migration required"

**Solución:** Ejecuta las migraciones:
```bash
npx prisma migrate deploy
```

---

## ✅ Checklist antes de iniciar

- [ ] Dependencias instaladas (`npm install`)
- [ ] Cliente Prisma generado (`npx prisma generate`)
- [ ] Migraciones ejecutadas (`npx prisma migrate deploy`)
- [ ] Archivo `.env` configurado
- [ ] Base de datos accesible
- [ ] Node.js 20+ instalado

---

## 🚀 Comandos rápidos

```bash
# Instalar todo de una vez
cd /opt/elbuenmenu/server && \
npm install && \
npx prisma generate && \
npx prisma migrate deploy && \
npm start
```

---

¡Listo! Tu servidor debería estar funcionando. 🎉

