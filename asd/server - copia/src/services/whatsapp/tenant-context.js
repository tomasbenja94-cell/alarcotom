import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STORE_FRONT_URL = process.env.STORE_FRONT_URL || 'https://elbuenmenu.site';

/**
 * Caché liviano de configuraciones por tienda.
 * Mantiene los datos unos minutos para evitar hits constantes a la BD.
 */
const CONFIG_CACHE = new Map(); // storeId -> { data, loadedAt }
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

/**
 * Normaliza configuraciones JSON (reglas, límites, textos, etc)
 */
function parseJsonConfig(rawValue, fallback = {}) {
  if (!rawValue) return fallback;
  if (typeof rawValue === 'object') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn('[TenantContext] Error parseando JSON:', error.message);
    return fallback;
  }
}

/**
 * Carga y normaliza los datos completos para una tienda.
 * @param {string} storeId
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function loadTenantContext(storeId, options = {}) {
  const { forceRefresh = false } = options;

  if (!storeId) {
    throw new Error('[TenantContext] storeId es requerido');
  }

  const cached = CONFIG_CACHE.get(storeId);
  if (!forceRefresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      settings: true
    }
  });

  if (!store) {
    throw new Error(`[TenantContext] Store no encontrada: ${storeId}`);
  }

  const settings = store.settings || {};

  const context = {
    storeId,
    storeName: store.name,
    panelType: store.panelType || 'rotiseria',
    isActive: store.status !== 'inactive',
    storeUrl: `${STORE_FRONT_URL}/menu?store=${storeId}`,
    storeRecord: store,
    settings,
    paymentConfig: {
      cashEnabled: settings.cashEnabled ?? true,
      transferEnabled: settings.transferEnabled ?? true,
      mercadoPagoEnabled: settings.mercadoPagoEnabled ?? false,
      transferAlias: settings.transferAlias || null,
      transferCvu: settings.transferCvu || null,
      transferTitular: settings.transferTitular || null,
      mercadoPagoLink: settings.mercadoPagoAccessToken ? null : settings.mercadoPagoLink,
      qrImage: settings.qrImage || null
    },
    securityRules: parseJsonConfig(settings.securityRules, {
      rateLimit: {
        windowMs: 60000,
        max: 20
      },
      abuseThreshold: 5,
      banDurations: {
        first: 24 * 60 * 60 * 1000,
        repeat: 5 * 24 * 60 * 60 * 1000
      }
    }),
    textOverrides: parseJsonConfig(settings.whatsappTexts, {}),
    serviceFlags: parseJsonConfig(settings.whatsappFeatures, {
      enableComplaints: false,
      enableFidelity: false,
      enableTracking: false
    }),
    limits: parseJsonConfig(settings.whatsappLimits, {
      maxPendingOrders: 5,
      maxComplaintsPerHour: 3
    }),
  whatsappSecurity: parseJsonConfig(settings.whatsappSecurityConfig, {}),
  whatsappLimits: parseJsonConfig(settings.whatsappLimitsConfig, {
    rateLimit: { windowMs: 60000, max: 20 },
    userRateLimit: { windowMs: 60000, max: 5 },
    maxPendingOrders: 5,
    maxComplaintsPerHour: 3
  }),
  whatsappTexts: parseJsonConfig(settings.whatsappTextsConfig, {}),
  whatsappFeatures: parseJsonConfig(settings.whatsappFeaturesConfig, {
    enableComplaints: false,
    enableFidelity: false,
    enableTracking: false
  }),
  whatsappRules: parseJsonConfig(settings.whatsappRulesConfig, {}),
    storagePaths: {
      proofs: settings.proofsPath || `server/proofs/${storeId}`,
      logs: settings.logsPath || `logs/whatsapp/${storeId}`
    }
  };

  CONFIG_CACHE.set(storeId, {
    loadedAt: Date.now(),
    data: context
  });

  return context;
}

/**
 * Invalida la caché para una tienda en particular.
 */
export function invalidateTenantContext(storeId) {
  CONFIG_CACHE.delete(storeId);
}

/**
 * Limpia todas las entradas en caché.
 */
export function invalidateAllTenantContexts() {
  CONFIG_CACHE.clear();
}

/**
 * Exponer prisma para usos puntuales (ej: rutas admin)
 */
export const tenantPrismaClient = prisma;

export default {
  loadTenantContext,
  invalidateTenantContext,
  invalidateAllTenantContexts
};

