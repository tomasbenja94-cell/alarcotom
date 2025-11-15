
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(__dirname, '../config.json');

// Configuración predeterminada
const DEFAULT_CONFIG = {
    alias: "ELBUENMENU.CVU",
    cvu: "0000007900001234567890",
    mercadoPagoLink: "https://mpago.la/elbuenmenu",
    horarios: "Lunes a Domingo de 11:00 a 23:00",
    menuUrl: "https://elbuenmenu.store/menu",
    mensajes: {
        bienvenida: "¡Hola! 👋 Bienvenido a El Buen Menú 🍔\\n1️⃣ Ver menú\\n2️⃣ Consultar pedido\\n3️⃣ Horarios",
        menu: "🛒 Podés ver nuestro menú completo aquí: https://elbuenmenu.store/menu",
        consultar_pedido: "Por favor, enviame tu número de pedido o nombre para consultar su estado 📦",
        pago_opciones: "Recibimos tu pedido 🧾\\nPor favor confirmá el método de pago:\\n💳 Transferencia / Mercado Pago / Efectivo",
        pago_confirmado: "💰 Transferencia confirmada. Tu pedido está en preparación 🍳",
        pedido_preparacion: "🍳 Tu pedido está en preparación.",
        pedido_en_camino: "🚴‍♂️ ¡Tu pedido está en camino!",
        pedido_entregado: "🏁 Pedido entregado. ¡Gracias por elegirnos! ❤️"
    }
};

// Cargar configuración
export function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            // Crear archivo de configuración con valores predeterminados
            fs.writeJsonSync(CONFIG_FILE, DEFAULT_CONFIG, { spaces: 2 });
            console.log('✅ Archivo de configuración creado:', CONFIG_FILE);
            return DEFAULT_CONFIG;
        }
        
        const config = fs.readJsonSync(CONFIG_FILE);
        
        // Fusionar con configuración predeterminada para asegurar que existan todas las propiedades
        const mergedConfig = { ...DEFAULT_CONFIG, ...config };
        
        // Asegurar que existan todos los mensajes
        mergedConfig.mensajes = { ...DEFAULT_CONFIG.mensajes, ...config.mensajes };
        
        return mergedConfig;
    } catch (error) {
        console.error('❌ Error al cargar configuración:', error);
        return DEFAULT_CONFIG;
    }
}

// Guardar configuración
export function saveConfig(config) {
    try {
        fs.writeJsonSync(CONFIG_FILE, config, { spaces: 2 });
        console.log('✅ Configuración guardada correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar configuración:', error);
        return false;
    }
}

// Actualizar un valor específico de configuración
export function updateConfigValue(key, value) {
    try {
        const config = loadConfig();
        
        // Manejar claves anidadas (ej: "mensajes.bienvenida")
        if (key.includes('.')) {
            const keys = key.split('.');
            let current = config;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                    current[keys[i]] = {};
                }
                current = current[keys[i]];
            }
            
            current[keys[keys.length - 1]] = value;
        } else {
            config[key] = value;
        }
        
        return saveConfig(config);
    } catch (error) {
        console.error('❌ Error al actualizar configuración:', error);
        return false;
    }
}

// Obtener un valor específico de configuración
export function getConfigValue(key) {
    try {
        const config = loadConfig();
        
        if (key.includes('.')) {
            const keys = key.split('.');
            let current = config;
            
            for (const k of keys) {
                if (current[k] === undefined) {
                    return null;
                }
                current = current[k];
            }
            
            return current;
        } else {
            return config[key];
        }
    } catch (error) {
        console.error('❌ Error al obtener valor de configuración:', error);
        return null;
    }
}

// Resetear configuración a valores predeterminados
export function resetConfig() {
    try {
        return saveConfig(DEFAULT_CONFIG);
    } catch (error) {
        console.error('❌ Error al resetear configuración:', error);
        return false;
    }
}

// Validar configuración
export function validateConfig(config) {
    const requiredFields = ['alias', 'cvu', 'horarios', 'menuUrl'];
    const requiredMessages = ['bienvenida', 'menu', 'consultar_pedido', 'pago_opciones', 'pago_confirmado'];
    
    // Verificar campos requeridos
    for (const field of requiredFields) {
        if (!config[field]) {
            return { valid: false, error: `Campo requerido faltante: ${field}` };
        }
    }
    
    // Verificar mensajes requeridos
    if (!config.mensajes) {
        return { valid: false, error: 'Sección de mensajes faltante' };
    }
    
    for (const message of requiredMessages) {
        if (!config.mensajes[message]) {
            return { valid: false, error: `Mensaje requerido faltante: ${message}` };
        }
    }
    
    return { valid: true };
}

// Exportar configuración predeterminada para referencia
export { DEFAULT_CONFIG };
