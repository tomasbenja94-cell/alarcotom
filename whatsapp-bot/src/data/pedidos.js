import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PEDIDOS_FILE = path.join(__dirname, 'pedidos.json');

// Datos de ejemplo para pedidos
const SAMPLE_PEDIDOS = [
    {
        id: 'PED001',
        codigo: '1234',
        cliente: 'Juan Pérez',
        telefono: '5493487302858',
        direccion: 'Av. San Martín 123',
        items: [
            { nombre: 'Pizza Muzzarella', cantidad: 1, precio: 2500 },
            { nombre: 'Coca Cola 1.5L', cantidad: 1, precio: 800 }
        ],
        total: 3300,
        delivery: 0,
        estado: 'confirmado', // confirmado, preparando, en_camino, entregado
        fecha: new Date().toISOString(),
        notas: 'Sin cebolla'
    },
    {
        id: 'PED002',
        codigo: '5678',
        cliente: 'María García',
        telefono: '5493487302859',
        direccion: 'Calle Belgrano 456',
        items: [
            { nombre: 'Hamburguesa Completa', cantidad: 2, precio: 2200 },
            { nombre: 'Papas fritas', cantidad: 1, precio: 1200 }
        ],
        total: 5600,
        delivery: 500,
        estado: 'preparando',
        fecha: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
        notas: 'Punto de la carne: jugoso'
    },
    {
        id: 'PED003',
        codigo: '9999',
        cliente: 'Carlos López',
        telefono: '5493487302860',
        direccion: 'Barrio Norte, Manzana 5',
        items: [
            { nombre: 'Empanadas de Carne', cantidad: 12, precio: 2000 }
        ],
        total: 2500,
        delivery: 500,
        estado: 'en_camino',
        fecha: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        notas: 'Portón azul'
    }
];

// Cargar pedidos desde archivo
export function loadPedidos() {
    try {
        if (!fs.existsSync(PEDIDOS_FILE)) {
            // Crear archivo con datos de ejemplo si no existe
            fs.writeJsonSync(PEDIDOS_FILE, SAMPLE_PEDIDOS, { spaces: 2 });
            return SAMPLE_PEDIDOS;
        }
        
        return fs.readJsonSync(PEDIDOS_FILE);
    } catch (error) {
        console.error('Error al cargar pedidos:', error);
        return SAMPLE_PEDIDOS;
    }
}

// Guardar pedidos en archivo
export function savePedidos(pedidos) {
    try {
        fs.writeJsonSync(PEDIDOS_FILE, pedidos, { spaces: 2 });
        return true;
    } catch (error) {
        console.error('Error al guardar pedidos:', error);
        return false;
    }
}

// Buscar pedido por código
export function findPedidoByCodigo(codigo) {
    const pedidos = loadPedidos();
    return pedidos.find(p => p.codigo === codigo);
}

// Buscar pedidos por teléfono
export function findPedidosByTelefono(telefono) {
    const pedidos = loadPedidos();
    return pedidos.filter(p => p.telefono === telefono);
}

// Actualizar estado del pedido
export function updatePedidoStatus(codigo, nuevoEstado) {
    try {
        const pedidos = loadPedidos();
        const pedidoIndex = pedidos.findIndex(p => p.codigo === codigo);
        
        if (pedidoIndex !== -1) {
            pedidos[pedidoIndex].estado = nuevoEstado;
            pedidos[pedidoIndex].fechaActualizacion = new Date().toISOString();
            
            savePedidos(pedidos);
            return pedidos[pedidoIndex];
        }
        
        return null;
    } catch (error) {
        console.error('Error al actualizar estado del pedido:', error);
        return null;
    }
}

// Crear nuevo pedido
export function createPedido(pedidoData) {
    try {
        const pedidos = loadPedidos();
        
        // Generar código único de 4 dígitos
        let codigo;
        do {
            codigo = Math.floor(1000 + Math.random() * 9000).toString();
        } while (pedidos.some(p => p.codigo === codigo));
        
        // Generar ID único
        const id = `PED${String(pedidos.length + 1).padStart(3, '0')}`;
        
        const nuevoPedido = {
            id,
            codigo,
            ...pedidoData,
            estado: 'confirmado',
            fecha: new Date().toISOString()
        };
        
        pedidos.push(nuevoPedido);
        savePedidos(pedidos);
        
        return nuevoPedido;
    } catch (error) {
        console.error('Error al crear pedido:', error);
        return null;
    }
}

// Obtener pedidos por estado
export function getPedidosByEstado(estado) {
    const pedidos = loadPedidos();
    return pedidos.filter(p => p.estado === estado);
}

// Obtener estadísticas de pedidos
export function getPedidosStats() {
    const pedidos = loadPedidos();
    const hoy = new Date().toDateString();
    
    const pedidosHoy = pedidos.filter(p => 
        new Date(p.fecha).toDateString() === hoy
    );
    
    return {
        total: pedidos.length,
        hoy: pedidosHoy.length,
        confirmados: pedidos.filter(p => p.estado === 'confirmado').length,
        preparando: pedidos.filter(p => p.estado === 'preparando').length,
        enCamino: pedidos.filter(p => p.estado === 'en_camino').length,
        entregados: pedidos.filter(p => p.estado === 'entregado').length,
        ventasHoy: pedidosHoy.reduce((sum, p) => sum + p.total, 0)
    };
}

// Función para simular cambio de estado (para testing)
export function simulateOrderProgress() {
    const pedidos = loadPedidos();
    
    // Cambiar algunos pedidos de estado automáticamente
    pedidos.forEach(pedido => {
        const tiempoTranscurrido = Date.now() - new Date(pedido.fecha).getTime();
        const minutosTranscurridos = tiempoTranscurrido / (1000 * 60);
        
        if (pedido.estado === 'confirmado' && minutosTranscurridos > 5) {
            pedido.estado = 'preparando';
            pedido.fechaActualizacion = new Date().toISOString();
        } else if (pedido.estado === 'preparando' && minutosTranscurridos > 25) {
            pedido.estado = 'en_camino';
            pedido.fechaActualizacion = new Date().toISOString();
        }
    });
    
    savePedidos(pedidos);
    return pedidos;
}

// Inicializar datos si no existen
loadPedidos();