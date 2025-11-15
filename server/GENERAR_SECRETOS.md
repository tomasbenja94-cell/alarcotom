# 🔐 Generar Secretos Seguros (JWT_SECRET e INTERNAL_API_KEY)

## ✅ Opción 1: Usando OpenSSL (Linux/Mac - Recomendado)

### En tu VPS, ejecuta:

```bash
# Generar JWT_SECRET (64 caracteres aleatorios)
openssl rand -base64 64

# Generar INTERNAL_API_KEY (32 caracteres hexadecimales)
openssl rand -hex 32
```

**Ejemplo de salida:**
```
JWT_SECRET: aBc123XyZ456... (será una cadena larga)
INTERNAL_API_KEY: 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d
```

---

## ✅ Opción 2: Usando Node.js

```bash
# Generar JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# Generar INTERNAL_API_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ✅ Opción 3: Generar Ambos de Una Vez

```bash
# Script rápido para generar ambos
echo "JWT_SECRET=$(openssl rand -base64 64)"
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)"
```

---

## 📝 Agregar al archivo .env

Después de generar los secretos, agrégarlos a `server/.env`:

```bash
cd /opt/elbuenmenu/server
nano .env
```

**Agrega estas líneas:**

```env
JWT_SECRET=TU_JWT_SECRET_GENERADO_AQUI
INTERNAL_API_KEY=TU_INTERNAL_API_KEY_GENERADO_AQUI
```

---

## ⚠️ IMPORTANTE

- **No compartas estos secretos** con nadie
- **No los subas a GitHub** (ya están en .gitignore)
- **Guárdalos en un lugar seguro** (por si necesitas resetear el servidor)
- **No los cambies** a menos que sea necesario (si los cambias, todos los tokens existentes dejarán de funcionar)

---

## 🔄 Si Necesitas Regenerarlos

Si por alguna razón necesitas regenerar los secretos:

1. Genera nuevos secretos con los comandos de arriba
2. Actualiza el `.env` del backend
3. Reinicia el backend: `pm2 restart backend`
4. **NOTA:** Esto invalidará todos los tokens de autenticación existentes. Los usuarios tendrán que iniciar sesión de nuevo.

---

¡Genera los secretos y agrégalos a tu `.env`! 🔐

