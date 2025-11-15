# 🔐 Configurar Git en la VPS

## ✅ Opción 1: Usar Personal Access Token (Más Rápido)

### 1. Crear Token en GitHub:
- Ve a: https://github.com/settings/tokens
- Click: "Generate new token" → "Generate new token (classic)"
- Nombre: `VPS Access`
- Scope: Marcar `repo`
- Click: "Generate token"
- **COPIA EL TOKEN** (solo se muestra una vez)

### 2. En la VPS:

```bash
# Cuando hagas git pull y te pida credenciales:
Username: tomasbenja94-cell
Password: [PEGA_TU_TOKEN_AQUI]
```

### 3. Guardar credenciales (opcional):

```bash
git config --global credential.helper store
# Esto guarda las credenciales para futuros pulls
```

---

## ✅ Opción 2: Usar SSH (Más Seguro - Recomendado)

### 1. Generar clave SSH en la VPS:

```bash
ssh-keygen -t ed25519 -C "vps@elbuenmenu"
# Presiona Enter 3 veces (usar ubicación por defecto, sin contraseña)
```

### 2. Ver tu clave pública:

```bash
cat ~/.ssh/id_ed25519.pub
# Copia TODO el contenido que aparece
```

### 3. Agregar clave a GitHub:

1. Ve a: https://github.com/settings/keys
2. Click: "New SSH key"
3. Title: `VPS El Buen Menu`
4. Key: Pega la clave que copiaste
5. Click: "Add SSH key"

### 4. Cambiar remote a SSH:

```bash
cd /opt/elbuenmenu
git remote set-url origin git@github.com:tomasbenja94-cell/alarcotom.git
```

### 5. Probar conexión:

```bash
ssh -T git@github.com
# Debería decir: "Hi tomasbenja94-cell! You've successfully authenticated..."
```

### 6. Ahora puedes hacer pull sin credenciales:

```bash
git pull
```

---

## ✅ Opción 3: Clonar con Token en URL (Una Sola Vez)

```bash
cd /opt
rm -rf elbuenmenu  # Si ya existe

# Clonar con token (reemplaza TU_TOKEN con tu token)
git clone https://TU_TOKEN@github.com/tomasbenja94-cell/alarcotom.git elbuenmenu

# O con usuario:
git clone https://tomasbenja94-cell:TU_TOKEN@github.com/tomasbenja94-cell/alarcotom.git elbuenmenu
```

---

## 🎯 Recomendación

**Para producción, usa SSH (Opción 2)** - Es más seguro y no necesitas ingresar credenciales cada vez.

**Para prueba rápida, usa Token (Opción 1)** - Es más rápido de configurar.

---

## 📝 Nota sobre Tokens

Si el token expira o lo revocas, deberás generar uno nuevo y volver a configurarlo.

---

¡Configura una opción y ya podrás hacer `git pull` sin problemas! 🚀

