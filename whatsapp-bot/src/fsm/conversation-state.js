/**
 * Finite State Machine (FSM) para flujo de conversación del bot
 * Maneja estados de conversación por usuario de forma modular
 */

// Estados posibles de la conversación
export const ConversationStates = {
  IDLE: 'idle',                    // Sin conversación activa
  GREETING: 'greeting',            // Saludo inicial
  BROWSING_MENU: 'browsing_menu',  // Viendo el menú
  SELECTING_CATEGORY: 'selecting_category',
  SELECTING_PRODUCT: 'selecting_product',
  ADDING_TO_CART: 'adding_to_cart',
  VIEWING_CART: 'viewing_cart',
  CHECKOUT_ADDRESS: 'checkout_address',
  CHECKOUT_PAYMENT: 'checkout_payment',
  CHECKOUT_CONFIRM: 'checkout_confirm',
  WAITING_TRANSFER: 'waiting_transfer',
  ORDER_PLACED: 'order_placed',
  TRACKING_ORDER: 'tracking_order',
  SUPPORT: 'support',
  ADMIN_COMMAND: 'admin_command',
};

// Transiciones permitidas entre estados
const TRANSITIONS = {
  [ConversationStates.IDLE]: [
    ConversationStates.GREETING,
    ConversationStates.BROWSING_MENU,
    ConversationStates.TRACKING_ORDER,
    ConversationStates.ADMIN_COMMAND,
  ],
  [ConversationStates.GREETING]: [
    ConversationStates.BROWSING_MENU,
    ConversationStates.IDLE,
  ],
  [ConversationStates.BROWSING_MENU]: [
    ConversationStates.SELECTING_CATEGORY,
    ConversationStates.SELECTING_PRODUCT,
    ConversationStates.VIEWING_CART,
    ConversationStates.IDLE,
  ],
  [ConversationStates.SELECTING_CATEGORY]: [
    ConversationStates.SELECTING_PRODUCT,
    ConversationStates.BROWSING_MENU,
    ConversationStates.IDLE,
  ],
  [ConversationStates.SELECTING_PRODUCT]: [
    ConversationStates.ADDING_TO_CART,
    ConversationStates.SELECTING_CATEGORY,
    ConversationStates.BROWSING_MENU,
    ConversationStates.IDLE,
  ],
  [ConversationStates.ADDING_TO_CART]: [
    ConversationStates.VIEWING_CART,
    ConversationStates.SELECTING_PRODUCT,
    ConversationStates.BROWSING_MENU,
    ConversationStates.IDLE,
  ],
  [ConversationStates.VIEWING_CART]: [
    ConversationStates.CHECKOUT_ADDRESS,
    ConversationStates.BROWSING_MENU,
    ConversationStates.IDLE,
  ],
  [ConversationStates.CHECKOUT_ADDRESS]: [
    ConversationStates.CHECKOUT_PAYMENT,
    ConversationStates.VIEWING_CART,
    ConversationStates.IDLE,
  ],
  [ConversationStates.CHECKOUT_PAYMENT]: [
    ConversationStates.CHECKOUT_CONFIRM,
    ConversationStates.CHECKOUT_ADDRESS,
    ConversationStates.IDLE,
  ],
  [ConversationStates.CHECKOUT_CONFIRM]: [
    ConversationStates.WAITING_TRANSFER,
    ConversationStates.ORDER_PLACED,
    ConversationStates.CHECKOUT_PAYMENT,
    ConversationStates.IDLE,
  ],
  [ConversationStates.WAITING_TRANSFER]: [
    ConversationStates.ORDER_PLACED,
    ConversationStates.IDLE,
  ],
  [ConversationStates.ORDER_PLACED]: [
    ConversationStates.TRACKING_ORDER,
    ConversationStates.IDLE,
  ],
  [ConversationStates.TRACKING_ORDER]: [
    ConversationStates.IDLE,
  ],
  [ConversationStates.SUPPORT]: [
    ConversationStates.IDLE,
  ],
  [ConversationStates.ADMIN_COMMAND]: [
    ConversationStates.IDLE,
  ],
};

/**
 * Clase para manejar el estado de conversación de un usuario
 */
export class ConversationFSM {
  constructor(userId, storeId) {
    this.userId = userId;
    this.storeId = storeId;
    this.state = ConversationStates.IDLE;
    this.data = {
      cart: [],
      selectedCategory: null,
      selectedProduct: null,
      address: null,
      paymentMethod: null,
      currentOrderId: null,
    };
    this.lastActivity = Date.now();
    this.history = [];
  }

  /**
   * Verificar si una transición es válida
   */
  canTransitionTo(newState) {
    const allowedTransitions = TRANSITIONS[this.state] || [];
    return allowedTransitions.includes(newState);
  }

  /**
   * Realizar transición a nuevo estado
   */
  transition(newState, additionalData = {}) {
    if (!this.canTransitionTo(newState)) {
      console.warn(`⚠️ Transición inválida: ${this.state} -> ${newState}`);
      return false;
    }

    this.history.push({
      from: this.state,
      to: newState,
      timestamp: Date.now(),
    });

    this.state = newState;
    this.data = { ...this.data, ...additionalData };
    this.lastActivity = Date.now();
    
    return true;
  }

  /**
   * Forzar transición (para casos especiales como timeout)
   */
  forceTransition(newState, additionalData = {}) {
    this.history.push({
      from: this.state,
      to: newState,
      timestamp: Date.now(),
      forced: true,
    });

    this.state = newState;
    this.data = { ...this.data, ...additionalData };
    this.lastActivity = Date.now();
  }

  /**
   * Resetear a estado inicial
   */
  reset() {
    this.state = ConversationStates.IDLE;
    this.data = {
      cart: [],
      selectedCategory: null,
      selectedProduct: null,
      address: null,
      paymentMethod: null,
      currentOrderId: null,
    };
    this.lastActivity = Date.now();
  }

  /**
   * Verificar si la sesión expiró (30 min de inactividad)
   */
  isExpired(timeoutMs = 30 * 60 * 1000) {
    return Date.now() - this.lastActivity > timeoutMs;
  }

  /**
   * Agregar producto al carrito
   */
  addToCart(product, quantity = 1, options = []) {
    const existingIndex = this.data.cart.findIndex(
      item => item.productId === product.id && 
              JSON.stringify(item.options) === JSON.stringify(options)
    );

    if (existingIndex >= 0) {
      this.data.cart[existingIndex].quantity += quantity;
    } else {
      this.data.cart.push({
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity,
        options,
      });
    }
    
    this.lastActivity = Date.now();
  }

  /**
   * Obtener total del carrito
   */
  getCartTotal() {
    return this.data.cart.reduce((total, item) => {
      const optionsExtra = (item.options || []).reduce((sum, opt) => sum + (opt.priceModifier || 0), 0);
      return total + (item.price + optionsExtra) * item.quantity;
    }, 0);
  }

  /**
   * Serializar para persistencia
   */
  toJSON() {
    return {
      userId: this.userId,
      storeId: this.storeId,
      state: this.state,
      data: this.data,
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Restaurar desde datos serializados
   */
  static fromJSON(json) {
    const fsm = new ConversationFSM(json.userId, json.storeId);
    fsm.state = json.state;
    fsm.data = json.data;
    fsm.lastActivity = json.lastActivity;
    return fsm;
  }
}

/**
 * Manager de conversaciones (singleton por store)
 */
export class ConversationManager {
  constructor() {
    this.conversations = new Map(); // `${storeId}:${userId}` -> ConversationFSM
    this.cleanupInterval = null;
  }

  /**
   * Obtener o crear conversación para un usuario
   */
  getOrCreate(userId, storeId) {
    const key = `${storeId}:${userId}`;
    
    if (!this.conversations.has(key)) {
      this.conversations.set(key, new ConversationFSM(userId, storeId));
    }
    
    const conversation = this.conversations.get(key);
    
    // Si expiró, resetear
    if (conversation.isExpired()) {
      conversation.reset();
    }
    
    return conversation;
  }

  /**
   * Eliminar conversación
   */
  remove(userId, storeId) {
    const key = `${storeId}:${userId}`;
    this.conversations.delete(key);
  }

  /**
   * Iniciar limpieza automática de sesiones expiradas
   */
  startCleanup(intervalMs = 5 * 60 * 1000) {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, conversation] of this.conversations) {
        if (conversation.isExpired()) {
          this.conversations.delete(key);
          console.log(`🧹 Sesión expirada eliminada: ${key}`);
        }
      }
    }, intervalMs);
  }

  /**
   * Detener limpieza
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    const byStore = {};
    const byState = {};
    
    for (const [key, conversation] of this.conversations) {
      // Por store
      if (!byStore[conversation.storeId]) {
        byStore[conversation.storeId] = 0;
      }
      byStore[conversation.storeId]++;
      
      // Por estado
      if (!byState[conversation.state]) {
        byState[conversation.state] = 0;
      }
      byState[conversation.state]++;
    }
    
    return {
      total: this.conversations.size,
      byStore,
      byState,
    };
  }
}

// Singleton global
export const conversationManager = new ConversationManager();
export default conversationManager;

