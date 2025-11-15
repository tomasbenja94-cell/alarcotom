-- ============================================
-- SCHEMA COMPLETO PARA SUPABASE
-- Incluye todas las tablas del proyecto
-- ============================================

-- ============================================
-- TABLAS DEL MENÚ
-- ============================================

-- Tabla de Categorías
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0, -- Para compatibilidad
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Productos
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0, -- Para compatibilidad
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Categorías de Opciones de Producto
CREATE TABLE IF NOT EXISTS product_option_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_required BOOLEAN DEFAULT false,
    min_selections INTEGER DEFAULT 1,
    max_selections INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0, -- Para compatibilidad
    depends_on_category_id UUID REFERENCES product_option_categories(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Opciones de Producto
-- Nota: category_id y option_category_id son aliases - solo usar uno en el código
CREATE TABLE IF NOT EXISTS product_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES product_option_categories(id) ON DELETE CASCADE,
    option_category_id UUID REFERENCES product_option_categories(id) ON DELETE CASCADE, -- Alias para compatibilidad con Prisma
    name TEXT NOT NULL,
    price_modifier DECIMAL(10, 2) DEFAULT 0,
    is_available BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0, -- Para compatibilidad
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLAS DE PEDIDOS
-- ============================================

-- Tabla de Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    customer_lat DECIMAL(10, 8),
    customer_lng DECIMAL(11, 8),
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    subtotal DECIMAL(10, 2) NOT NULL,
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    delivery_code TEXT,
    tracking_token TEXT UNIQUE,
    delivery_person_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Items del Pedido
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    selected_options JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLAS DE CLIENTES
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    is_blocked BOOLEAN DEFAULT false,
    disabled_payment_methods JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLAS DE REPARTIDORES
-- ============================================

CREATE TABLE IF NOT EXISTS delivery_persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    password TEXT, -- DEPRECATED
    password_hash TEXT,
    is_active BOOLEAN DEFAULT true,
    current_order_id UUID UNIQUE,
    total_deliveries INTEGER DEFAULT 0,
    last_lat DECIMAL(10, 8),
    last_lng DECIMAL(11, 8),
    last_seen_at TIMESTAMP WITH TIME ZONE,
    balance DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar foreign key para delivery_person_id después de crear delivery_persons
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_orders_delivery_person'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_delivery_person 
            FOREIGN KEY (delivery_person_id) REFERENCES delivery_persons(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Si hay un error (ej: datos existentes), simplemente continuar
        RAISE NOTICE 'No se pudo agregar la foreign key fk_orders_delivery_person: %', SQLERRM;
END $$;

-- Tabla de Sesiones de Repartidores
CREATE TABLE IF NOT EXISTS driver_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES delivery_persons(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    device_info TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Transacciones de Balance de Repartidores
CREATE TABLE IF NOT EXISTS driver_balance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES delivery_persons(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- "delivery", "pago_admin", "ajuste"
    amount DECIMAL(10, 2) NOT NULL,
    reference TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Intentos de Código de Entrega
CREATE TABLE IF NOT EXISTS delivery_code_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(order_id, driver_id)
);

-- ============================================
-- TABLAS DE ADMINISTRACIÓN
-- ============================================

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    user_id TEXT,
    user_role TEXT,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLAS DEL BOT
-- ============================================

-- Tabla de Mensajes del Bot
CREATE TABLE IF NOT EXISTS bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_key TEXT UNIQUE NOT NULL,
    message_text TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Mensajes de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    message_text TEXT NOT NULL,
    message_type TEXT DEFAULT 'sent',
    direction TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Transferencias Pendientes
CREATE TABLE IF NOT EXISTS pending_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    transfer_reference TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'pending',
    proof_image_url TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ÍNDICES PARA MEJOR RENDIMIENTO
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_available);
CREATE INDEX IF NOT EXISTS idx_product_option_categories_product ON product_option_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_options_category ON product_options(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_person ON orders(delivery_person_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order ON whatsapp_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_pending_transfers_order ON pending_transfers(order_id);
CREATE INDEX IF NOT EXISTS idx_pending_transfers_status ON pending_transfers(status);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_driver ON driver_sessions(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_token ON driver_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_admin ON refresh_tokens(admin_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_driver ON driver_balance_transactions(driver_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_order ON driver_balance_transactions(order_id);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_option_categories_updated_at BEFORE UPDATE ON product_option_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_options_updated_at BEFORE UPDATE ON product_options
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_persons_updated_at BEFORE UPDATE ON delivery_persons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_messages_updated_at BEFORE UPDATE ON bot_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pending_transfers_updated_at BEFORE UPDATE ON pending_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_code_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_transfers ENABLE ROW LEVEL SECURITY;

-- Políticas: Permitir lectura pública (para el frontend)
-- Eliminar políticas existentes si existen antes de crearlas
DROP POLICY IF EXISTS "Public read access categories" ON categories;
DROP POLICY IF EXISTS "Public read access products" ON products;
DROP POLICY IF EXISTS "Public read access product_option_categories" ON product_option_categories;
DROP POLICY IF EXISTS "Public read access product_options" ON product_options;
DROP POLICY IF EXISTS "Public insert orders" ON orders;
DROP POLICY IF EXISTS "Public insert order_items" ON order_items;
DROP POLICY IF EXISTS "Public read orders" ON orders;
DROP POLICY IF EXISTS "Public read order_items" ON order_items;
DROP POLICY IF EXISTS "Read own orders" ON orders;

-- Crear las políticas
CREATE POLICY "Public read access categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public read access products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read access product_option_categories" ON product_option_categories FOR SELECT USING (true);
CREATE POLICY "Public read access product_options" ON product_options FOR SELECT USING (true);

-- Políticas: Permitir inserción de pedidos (para checkout)
CREATE POLICY "Public insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert order_items" ON order_items FOR INSERT WITH CHECK (true);

-- Políticas: Permitir lectura de pedidos (limitado)
CREATE POLICY "Public read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Public read order_items" ON order_items FOR SELECT USING (true);

-- Nota: Para operaciones de escritura (INSERT, UPDATE, DELETE) en otras tablas,
-- necesitarás configurar políticas adicionales usando autenticación de Supabase.
-- Por ahora, estas políticas básicas permiten que el frontend funcione para lectura.

