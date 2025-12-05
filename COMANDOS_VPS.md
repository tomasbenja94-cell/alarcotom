# Comandos para ejecutar en el VPS

## Una vez conectado por SSH:

```bash
ssh root@149.50.147.180
```

## 1. Verificar superadmins existentes

```bash




```

## 2. Crear un nuevo superadmin

```bash
cd /opt/elbuenmenu/server
node create-superadmin.js
```

O usar el script general:

```bash
cd /opt/elbuenmenu/server
node create-admin.js
# Cuando pregunte el rol, escribir: super_admin
```

## 3. Verificar estado del backend

```bash
pm2 status
pm2 logs backend --lines 50
```

## 4. Reiniciar backend si es necesario

```bash
pm2 restart backend
pm2 logs backend --lines 20
```

## 5. Verificar base de datos

```bash
cd /opt/elbuenmenu/server
node check-superadmins.js
```

## 6. Ver todos los admins (con roles)

```bash
cd /opt/elbuenmenu/server
node -e "
import('@prisma/client').then(({ PrismaClient }) => {
  const prisma = new PrismaClient();
  prisma.admin.findMany({
    select: { username: true, role: true, isActive: true, storeId: true },
    orderBy: { role: 'asc' }
  }).then(admins => {
    console.log('Admins:', JSON.stringify(admins, null, 2));
    prisma.\$disconnect();
  });
});
"
```

## 7. Si necesitas actualizar código desde GitHub

```bash
cd /opt/elbuenmenu
git pull origin main
cd server
npm install  # Solo si hay nuevos paquetes
npx prisma generate  # Si hay cambios en el schema
pm2 restart backend
```

## 8. Ver logs en tiempo real

```bash
pm2 logs backend
# Presionar Ctrl+C para salir
```

## 9. Construir el frontend (después de actualizar código)

```bash
cd /opt/elbuenmenu
# Verificar que existe package.json en la raíz
ls -la package.json
# Si no existe, verificar estructura del proyecto
ls -la

# Instalar dependencias si es necesario
npm install

# Construir el frontend
npm run build

# Esto generará la carpeta 'out/' con los archivos estáticos
# Luego copiar a la carpeta pública del servidor web (si es necesario)
```

## 10. Verificar estructura del proyecto

```bash
cd /opt/elbuenmenu
# Deberías ver:
# - package.json (frontend)
# - vite.config.ts
# - src/
# - server/ (backend)
# - whatsapp-bot/ (bot)
```

