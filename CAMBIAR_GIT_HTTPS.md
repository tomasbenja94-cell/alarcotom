# 🔧 Cambiar Git de SSH a HTTPS

## ✅ Solución Rápida: Cambiar a HTTPS

En tu VPS, ejecuta:

```bash
cd /opt/elbuenmenu

# Cambiar remote de SSH a HTTPS
git remote set-url origin https://github.com/tomasbenja94-cell/alarcotom.git

# Verificar que cambió
git remote -v

# Ahora hacer pull (te pedirá usuario y token)
git pull
```

---

## 🔑 Crear Token de GitHub

Si aún no tienes token:

1. Ve a: https://github.com/settings/tokens/new
2. Click "Generate new token (classic)"
3. Nombre: `VPS Access`
4. Scope: Marcar `repo`
5. Click "Generate token"
6. **COPIA EL TOKEN** (solo se muestra una vez)

---

## 📝 Usar el Token

Cuando hagas `git pull` y te pida:

```
Username: tomasbenja94-cell
Password: TU_TOKEN_QUE_COPIASTE
```

**Para guardar credenciales:**

```bash
git config --global credential.helper store
git pull
# Ingresa usuario y token UNA VEZ
# Después ya no te pedirá nada
```

---

¡Listo! Ya puedes hacer `git pull` sin problemas. 🚀

