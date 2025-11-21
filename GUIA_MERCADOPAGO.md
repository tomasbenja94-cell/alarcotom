# 💳 Guía de Configuración de Mercado Pago

Esta guía explica cómo configurar las credenciales de Mercado Pago para que los links de pago se generen dinámicamente con el monto correcto.

---

## 📋 Requisitos Previos

1. **Cuenta de Mercado Pago**: Necesitas tener una cuenta de desarrollador en Mercado Pago
2. **Aplicación creada**: Debes crear una aplicación en el panel de desarrolladores de Mercado Pago
3. **Credenciales**: Obtener el **Access Token** y **Public Key** de tu aplicación

---

## 🔑 Paso 1: Obtener las Credenciales de Mercado Pago

### 1.1. Acceder al Panel de Desarrolladores

1. Ve a: https://www.mercadopago.com.ar/developers
2. Inicia sesión con tu cuenta de Mercado Pago
3. Ve a **"Tus integraciones"** o **"Aplicaciones"**

### 1.2. Crear una Aplicación (si no tienes una)

1. Haz clic en **"Crear aplicación"**
2. Completa los datos:
   - **Nombre**: "El Buen Menú" (o el que prefieras)
   - **Categoría**: Selecciona la más apropiada
   - **Plataforma**: Web
3. Haz clic en **"Crear"**

### 1.3. Obtener las Credenciales

Una vez creada la aplicación, verás dos tipos de credenciales:

#### **Credenciales de Producción** (para usar en producción):
- **Access Token**: `APP_USR-xxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxx`
- **Public Key**: `APP_USR-xxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### **Credenciales de Prueba** (para testing):
- **Access Token de Prueba**: `TEST-xxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxx`
- **Public Key de Prueba**: `TEST-xxxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

⚠️ **IMPORTANTE**: 
- Usa **Credenciales de Producción** para recibir pagos reales
- Usa **Credenciales de Prueba** solo para probar la integración

---

## 🛠️ Paso 2: Configurar las Credenciales

Hay **DOS formas** de configurar las credenciales. Elige la que prefieras:

### **Opción A: Desde el Panel de Administración** (Recomendado) ⭐

Esta es la forma más fácil y no requiere acceso al servidor.

#### Pasos:

1. **Accede al Panel de Administración**
   - Ve a: `https://elbuenmenu.site/admin` (o tu URL de admin)
   - Inicia sesión con tus credenciales de administrador

2. **Navega a Configuración de Pagos**
   - En el menú lateral, busca **"Configuración de Pagos"** o **"Payment Config"**
   - O ve directamente a la sección de configuración

3. **Ingresa las Credenciales de Mercado Pago**
   - **Access Token**: Pega tu Access Token de Mercado Pago
   - **Public Key**: Pega tu Public Key de Mercado Pago
   - **Habilitado**: Asegúrate de que esté activado (toggle ON)

4. **Guarda la Configuración**
   - Haz clic en **"Guardar"**
   - Espera a ver el mensaje de confirmación: "✅ Configuración guardada correctamente"

5. **Prueba la Conexión** (Opcional pero recomendado)
   - Haz clic en **"Probar Conexión"** o **"Test Mercado Pago"**
   - Deberías ver: "✅ Conexión con Mercado Pago exitosa - Links dinámicos activos"

#### Ventajas:
- ✅ No necesitas acceso SSH al servidor
- ✅ Puedes cambiar las credenciales fácilmente desde cualquier lugar
- ✅ Se guarda en la base de datos (persistente)
- ✅ Interfaz visual y fácil de usar

---

### **Opción B: Variables de Entorno** (Avanzado)

Esta opción requiere acceso SSH al servidor VPS.

#### Pasos:

1. **Conectarse al Servidor VPS**
   ```bash
   ssh root@tu-servidor.com
   ```

2. **Navegar al Directorio del Proyecto**
   ```bash
   cd /opt/elbuenmenu/server
   ```

3. **Editar el Archivo .env**
   ```bash
   nano .env
   ```
   
   O si usas otro editor:
   ```bash
   vi .env
   ```

4. **Agregar las Variables de Entorno**
   
   Agrega estas líneas al archivo `.env`:
   ```env
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-tu-access-token-aqui
   MERCADOPAGO_PUBLIC_KEY=APP_USR-tu-public-key-aqui
   ```
   
   **Ejemplo real:**
   ```env
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-3099619996812490-102801-eb9ab207ccdc60dd066dcfe1bc60c65d-1045480277
   MERCADOPAGO_PUBLIC_KEY=APP_USR-4bd75427-2f2f-458a-a4be-e8fde5f96a94
   ```

5. **Guardar y Salir**
   - Si usas `nano`: Presiona `Ctrl + X`, luego `Y`, luego `Enter`
   - Si usas `vi`: Presiona `Esc`, luego escribe `:wq` y presiona `Enter`

6. **Reiniciar el Backend**
   ```bash
   pm2 restart backend-elbuenmenu
   ```

7. **Verificar que Funcione**
   ```bash
   pm2 logs backend-elbuenmenu | grep "Mercado Pago"
   ```
   
   Deberías ver:
   ```
   ✅ Mercado Pago configurado correctamente
   ```

#### Ventajas:
- ✅ Las credenciales están en el servidor (más seguro)
- ✅ No se guardan en la base de datos
- ✅ Útil para configuraciones de producción

#### Desventajas:
- ❌ Requiere acceso SSH
- ❌ Más difícil de cambiar

---

## ✅ Paso 3: Verificar que Funcione

### 3.1. Desde el Panel de Administración

1. Ve a **"Configuración de Pagos"**
2. Haz clic en **"Probar Conexión"** o **"Test Mercado Pago"**
3. Deberías ver: **"✅ Conexión con Mercado Pago exitosa - Links dinámicos activos"**

### 3.2. Desde el Bot de WhatsApp

1. Haz un pedido de prueba desde WhatsApp
2. Cuando el bot te pregunte el método de pago, selecciona **"2️⃣ Mercado Pago"**
3. Deberías recibir un link de Mercado Pago con el monto correcto del pedido

### 3.3. Verificar los Logs del Backend

```bash
pm2 logs backend-elbuenmenu | grep "Mercado Pago"
```

Deberías ver logs como:
```
💰 [Mercado Pago] Datos recibidos: { amount: 5000, normalizedAmount: 5000, ... }
💰 [Mercado Pago] Creando preferencia con monto: 5000
✅ [Mercado Pago] Preferencia creada: { id: '...', init_point: 'https://...', ... }
```

---

## 🔍 Solución de Problemas

### Problema 1: "Mercado Pago no está configurado"

**Síntomas:**
- El bot envía un link estático de Mercado Pago (sin monto)
- Los logs muestran: "⚠️ MERCADOPAGO_ACCESS_TOKEN no está configurado"

**Solución:**
1. Verifica que hayas guardado las credenciales correctamente
2. Si usaste el panel de admin, verifica que se haya guardado en la base de datos
3. Si usaste variables de entorno, verifica que estén en el archivo `.env`
4. Reinicia el backend: `pm2 restart backend-elbuenmenu`

### Problema 2: "Error al generar link de pago"

**Síntomas:**
- El bot no puede generar el link de Mercado Pago
- Los logs muestran errores de Mercado Pago

**Solución:**
1. Verifica que las credenciales sean correctas (sin espacios extra)
2. Verifica que estés usando credenciales de **producción** (no de prueba) si estás en producción
3. Verifica que tu aplicación de Mercado Pago esté activa
4. Revisa los logs completos: `pm2 logs backend-elbuenmenu --lines 100`

### Problema 3: "El link no tiene el monto correcto"

**Síntomas:**
- El link de Mercado Pago se genera pero con monto $0 o incorrecto

**Solución:**
1. Verifica que el pedido tenga un total válido
2. Revisa los logs del bot: `pm2 logs whatsapp-bot-elbuenmenu | grep "Mercado Pago"`
3. Verifica que el `orderTotal` se esté calculando correctamente

### Problema 4: "Las credenciales no se guardan"

**Síntomas:**
- Guardas las credenciales pero no se aplican
- El sistema sigue usando el fallback estático

**Solución:**
1. Verifica que tengas permisos de administrador
2. Verifica que el backend esté corriendo: `pm2 status`
3. Verifica la conexión a la base de datos
4. Revisa los logs del backend para ver errores

---

## 📝 Notas Importantes

### Seguridad

- ⚠️ **NUNCA** compartas tus credenciales de Mercado Pago
- ⚠️ **NUNCA** subas el archivo `.env` a GitHub o repositorios públicos
- ⚠️ Las credenciales de **producción** son sensibles - guárdalas de forma segura

### Producción vs Prueba

- **Producción**: Usa credenciales de producción para recibir pagos reales
- **Prueba**: Usa credenciales de prueba solo para testing (no recibirás dinero real)

### Prioridad de Configuración

El sistema usa las credenciales en este orden de prioridad:

1. **Variables de entorno** (`MERCADOPAGO_ACCESS_TOKEN` en `.env`) - **Mayor prioridad**
2. **Base de datos** (configuración desde el panel de admin) - **Segunda prioridad**
3. **Fallback estático** (si no hay configuración) - **Última opción**

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs del backend: `pm2 logs backend-elbuenmenu`
2. Revisa los logs del bot: `pm2 logs whatsapp-bot-elbuenmenu`
3. Verifica que las credenciales sean correctas en el panel de Mercado Pago
4. Prueba con credenciales de prueba primero para verificar que funciona

---

## 📚 Recursos Adicionales

- **Documentación de Mercado Pago**: https://www.mercadopago.com.ar/developers/es/docs
- **Panel de Desarrolladores**: https://www.mercadopago.com.ar/developers
- **Guía de Integración**: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing

---

**Última actualización**: $(date)
**Versión**: 1.0.0

