/**
 * Sistema de Roles y Permisos Granulares
 */

// Definición de permisos disponibles
export const PERMISSIONS = {
  // Pedidos
  ORDERS_VIEW: 'orders:view',
  ORDERS_CREATE: 'orders:create',
  ORDERS_UPDATE: 'orders:update',
  ORDERS_CANCEL: 'orders:cancel',
  ORDERS_ASSIGN: 'orders:assign',
  ORDERS_EXPORT: 'orders:export',

  // Productos
  PRODUCTS_VIEW: 'products:view',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  PRODUCTS_STOCK: 'products:stock',

  // Categorías
  CATEGORIES_VIEW: 'categories:view',
  CATEGORIES_MANAGE: 'categories:manage',

  // Clientes
  CUSTOMERS_VIEW: 'customers:view',
  CUSTOMERS_EXPORT: 'customers:export',
  CUSTOMERS_CONTACT: 'customers:contact',

  // Reportes
  REPORTS_VIEW: 'reports:view',
  REPORTS_EXPORT: 'reports:export',
  REPORTS_FINANCIAL: 'reports:financial',

  // Configuración
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_INTEGRATIONS: 'settings:integrations',

  // Usuarios
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_PERMISSIONS: 'users:permissions',

  // Bot WhatsApp
  BOT_VIEW: 'bot:view',
  BOT_MANAGE: 'bot:manage',
  BOT_TEMPLATES: 'bot:templates',

  // Cupones
  COUPONS_VIEW: 'coupons:view',
  COUPONS_MANAGE: 'coupons:manage',

  // Delivery
  DELIVERY_VIEW: 'delivery:view',
  DELIVERY_ASSIGN: 'delivery:assign',
  DELIVERY_ZONES: 'delivery:zones',

  // Tienda
  STORE_VIEW: 'store:view',
  STORE_PAUSE: 'store:pause',
  STORE_MAINTENANCE: 'store:maintenance',
};

// Roles predefinidos con sus permisos
export const ROLES = {
  super_admin: {
    name: 'Super Admin',
    description: 'Acceso completo a todas las funciones',
    permissions: Object.values(PERMISSIONS),
  },
  
  store_admin: {
    name: 'Administrador de Tienda',
    description: 'Gestión completa de una tienda',
    permissions: [
      PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_UPDATE, PERMISSIONS.ORDERS_CANCEL, PERMISSIONS.ORDERS_ASSIGN, PERMISSIONS.ORDERS_EXPORT,
      PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.PRODUCTS_CREATE, PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.PRODUCTS_DELETE, PERMISSIONS.PRODUCTS_STOCK,
      PERMISSIONS.CATEGORIES_VIEW, PERMISSIONS.CATEGORIES_MANAGE,
      PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.CUSTOMERS_EXPORT, PERMISSIONS.CUSTOMERS_CONTACT,
      PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_UPDATE,
      PERMISSIONS.BOT_VIEW, PERMISSIONS.BOT_MANAGE, PERMISSIONS.BOT_TEMPLATES,
      PERMISSIONS.COUPONS_VIEW, PERMISSIONS.COUPONS_MANAGE,
      PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.DELIVERY_ASSIGN, PERMISSIONS.DELIVERY_ZONES,
      PERMISSIONS.STORE_VIEW, PERMISSIONS.STORE_PAUSE,
    ],
  },

  store_manager: {
    name: 'Gerente',
    description: 'Gestión de operaciones diarias',
    permissions: [
      PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_UPDATE, PERMISSIONS.ORDERS_CANCEL, PERMISSIONS.ORDERS_ASSIGN,
      PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.PRODUCTS_STOCK,
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.DELIVERY_ASSIGN,
      PERMISSIONS.STORE_VIEW, PERMISSIONS.STORE_PAUSE,
    ],
  },

  cashier: {
    name: 'Cajero',
    description: 'Gestión de pedidos y caja',
    permissions: [
      PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_UPDATE,
      PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.PRODUCTS_STOCK,
      PERMISSIONS.CUSTOMERS_VIEW,
    ],
  },

  delivery: {
    name: 'Repartidor',
    description: 'Ver y gestionar entregas asignadas',
    permissions: [
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.DELIVERY_VIEW,
    ],
  },

  viewer: {
    name: 'Solo Lectura',
    description: 'Solo puede ver información',
    permissions: [
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
};

class PermissionsService {
  /**
   * Verificar si un usuario tiene un permiso
   */
  hasPermission(user, permission) {
    if (!user) return false;
    
    // Super admin tiene todos los permisos
    if (user.role === 'super_admin') return true;

    // Verificar permisos del rol
    const roleConfig = ROLES[user.role];
    if (roleConfig?.permissions.includes(permission)) {
      return true;
    }

    // Verificar permisos personalizados
    if (user.customPermissions?.includes(permission)) {
      return true;
    }

    return false;
  }

  /**
   * Verificar múltiples permisos (AND)
   */
  hasAllPermissions(user, permissions) {
    return permissions.every(p => this.hasPermission(user, p));
  }

  /**
   * Verificar al menos un permiso (OR)
   */
  hasAnyPermission(user, permissions) {
    return permissions.some(p => this.hasPermission(user, p));
  }

  /**
   * Obtener todos los permisos de un usuario
   */
  getUserPermissions(user) {
    if (!user) return [];
    
    if (user.role === 'super_admin') {
      return Object.values(PERMISSIONS);
    }

    const roleConfig = ROLES[user.role];
    const rolePermissions = roleConfig?.permissions || [];
    const customPermissions = user.customPermissions || [];

    return [...new Set([...rolePermissions, ...customPermissions])];
  }

  /**
   * Obtener permisos agrupados por categoría
   */
  getPermissionsByCategory() {
    const categories = {};
    
    Object.entries(PERMISSIONS).forEach(([key, value]) => {
      const [category] = value.split(':');
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({
        key,
        value,
        label: this.getPermissionLabel(value),
      });
    });

    return categories;
  }

  /**
   * Obtener etiqueta legible de un permiso
   */
  getPermissionLabel(permission) {
    const labels = {
      'orders:view': 'Ver pedidos',
      'orders:create': 'Crear pedidos',
      'orders:update': 'Actualizar pedidos',
      'orders:cancel': 'Cancelar pedidos',
      'orders:assign': 'Asignar pedidos',
      'orders:export': 'Exportar pedidos',
      'products:view': 'Ver productos',
      'products:create': 'Crear productos',
      'products:update': 'Editar productos',
      'products:delete': 'Eliminar productos',
      'products:stock': 'Gestionar stock',
      'categories:view': 'Ver categorías',
      'categories:manage': 'Gestionar categorías',
      'customers:view': 'Ver clientes',
      'customers:export': 'Exportar clientes',
      'customers:contact': 'Contactar clientes',
      'reports:view': 'Ver reportes',
      'reports:export': 'Exportar reportes',
      'reports:financial': 'Reportes financieros',
      'settings:view': 'Ver configuración',
      'settings:update': 'Modificar configuración',
      'settings:integrations': 'Gestionar integraciones',
      'users:view': 'Ver usuarios',
      'users:create': 'Crear usuarios',
      'users:update': 'Editar usuarios',
      'users:delete': 'Eliminar usuarios',
      'users:permissions': 'Gestionar permisos',
      'bot:view': 'Ver bot WhatsApp',
      'bot:manage': 'Gestionar bot',
      'bot:templates': 'Gestionar plantillas',
      'coupons:view': 'Ver cupones',
      'coupons:manage': 'Gestionar cupones',
      'delivery:view': 'Ver delivery',
      'delivery:assign': 'Asignar delivery',
      'delivery:zones': 'Gestionar zonas',
      'store:view': 'Ver tienda',
      'store:pause': 'Pausar tienda',
      'store:maintenance': 'Modo mantenimiento',
    };
    return labels[permission] || permission;
  }

  /**
   * Middleware de autorización
   */
  authorize(...requiredPermissions) {
    return (req, res, next) => {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const hasAccess = requiredPermissions.length === 0 ||
        this.hasAnyPermission(user, requiredPermissions);

      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Sin permisos',
          required: requiredPermissions,
        });
      }

      next();
    };
  }

  /**
   * Crear rol personalizado
   */
  createCustomRole(name, description, permissions) {
    return {
      name,
      description,
      permissions,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
  }
}

export const permissionsService = new PermissionsService();
export default permissionsService;

