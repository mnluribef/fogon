-- Esquema de Base de Datos - FOGÓN Restaurante Venezolano

-- Tabla de Tipos de Producto (Categorías del menú)
CREATE TABLE IF NOT EXISTS product_types (\n    id TEXT PRIMARY KEY, -- 'entradas', 'principales', 'combos', 'postres', 'bebidas'
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'package',
    attributes TEXT DEFAULT '[]' -- JSON array de atributos válidos para esta rama
);

-- Tabla de Productos
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0.0,
    category TEXT,
    icon TEXT,
    image_url TEXT,
    sizes TEXT, -- Opciones secundarias separadas por comas
    type_id TEXT REFERENCES product_types(id),
    active INTEGER NOT NULL DEFAULT 1, -- 1 = Activo, 0 = Inactivo
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Atributos de Producto por Instancia
CREATE TABLE IF NOT EXISTS product_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    attr_key TEXT NOT NULL,       -- Ej: 'proteina', 'punto', 'tamaño'
    attr_label TEXT NOT NULL,     -- Ej: 'Proteína', 'Punto de Cocción'
    attr_values TEXT NOT NULL,    -- JSON array: ["Res","Pollo"]
    attr_type TEXT DEFAULT 'select', -- 'select', 'color_swatch', 'toggle'
    price_matrix TEXT DEFAULT '{}',  -- JSON object con deltas de precio
    required INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Tabla de Variantes/Opciones de Producto (Para stock e identificadores únicos opcionales)
CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    sku TEXT,
    label TEXT NOT NULL,          -- Ej: 'Familiar, 4 personas'
    price_delta REAL DEFAULT 0.0,
    stock INTEGER DEFAULT -1,     -- -1 = Ilimitado
    active INTEGER DEFAULT 1,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Tabla de Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, -- ID único del pedido (ej: FOG-XXXX)
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    delivery_type TEXT NOT NULL DEFAULT 'delivery', -- 'delivery' o 'retiro'
    delivery_address TEXT,
    delivery_notes TEXT,
    payment_method TEXT,
    payment_reference TEXT,
    payment_receipt TEXT, -- Imagen del comprobante (Base64 o URL segura)
    bcv_rate REAL DEFAULT 0.0, -- Tasa oficial BCV al momento del pedido
    total_bs REAL DEFAULT 0.0, -- Monto equivalente en Bolívares
    status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente, en_produccion, listo_entrega, completado, cancelado
    total_items INTEGER NOT NULL DEFAULT 0,
    total_price REAL NOT NULL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Detalles de Pedido (Productos asociados)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    size TEXT, -- Opción seleccionada (ej: Término, Bebida, etc.)
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL DEFAULT 0.0, -- Precio al momento de la compra
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Tabla de Ventas Registradas
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    monto REAL NOT NULL DEFAULT 0.0,
    metodo_pago TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Tabla de Usuarios Administradores
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT, -- Salt para PBKDF2 (Nulo indica que requiere migración desde SHA-256)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Sesiones Activas
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL -- Timestamp Unix de expiración
);

-- Tabla de Configuraciones del Sistema (Tasa BCV, switches del negocio)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- --- ÍNDICES PARA OPTIMIZACIÓN DE BÚSQUEDAS ---
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type_id);
CREATE INDEX IF NOT EXISTS idx_product_attributes_product ON product_attributes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_fecha ON sales(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- --- PRECARGA DE DATOS ---

-- Configuraciones Iniciales
INSERT OR IGNORE INTO settings (key, value) VALUES 
('bcv_rate', '36.50'),
('bcv_auto_update', '1'),
('bcv_updated_at', CURRENT_TIMESTAMP);

-- Categorías
INSERT OR IGNORE INTO product_types (id, name, description, icon) VALUES
('entradas', 'Entradas y Pasapalos', 'Tequeños, empanaditas y delicias para abrir el apetito.', 'utensils'),
('principales', 'Platos Principales', 'Pabellón criollo, carnes a la brasa, cachapas y asados.', 'flame'),
('combos', 'Combos y Promociones', 'La mejor opción para compartir en familia o con amigos.', 'users'),
('postres', 'Postres Tradicionales', 'Tres leches, quesillo casero y dulces venezolanos.', 'cake'),
('bebidas', 'Bebidas Típicas', 'Papelón con limón, jugos naturales y refrescos.', 'cup-soda');

-- Platos del Menú
INSERT OR IGNORE INTO products (id, name, type_id, category, price, icon, description, image_url, sizes, active) VALUES
('pabellon-criollo', 'Pabellón Criollo Especial', 'principales', 'principales', 12.00, 'utensils', 'Carne mechada tierna y jugosa, caraotas negras con queso blanco rallado, arroz blanco y tajadas de plátano maduro.', 'assets/product_pabellon.webp', 'Carne Mechada, Pollo Mechado', 1),
('asado-negro', 'Asado Negro Tradicional', 'principales', 'principales', 14.50, 'utensils', 'Corte de res cocinado a fuego lento en reducción dulce de papelón y especias. Acompañado de puré de papas y arroz.', 'assets/product_asado.webp', 'Puré de Papas, Arroz y Ensalada', 1),
('cachapa-queso', 'Cachapa con Queso de Mano', 'principales', 'principales', 9.50, 'flame', 'Masa fresca de maíz tierno cocida al budare, rellena con auténtico queso de mano y bañada con mantequilla criolla.', 'assets/product_cachapa.webp', 'Sola, Con Pernil (+3$), Con Carne Mechada (+3$)', 1),
('tequenos-queso', 'Tequeños Tradicionales (6 und)', 'entradas', 'entradas', 6.00, 'utensils', 'Deditos de masa crujiente rellenos con abundante queso llanero fundido. Servidos con salsa tártara de la casa.', 'assets/product_tequenos.webp', '6 unidades, 12 unidades (+5$)', 1),
('empanaditas-degustacion', 'Mini Empanadas Criollas (4 und)', 'entradas', 'entradas', 5.50, 'utensils', 'Degustación de mini empanadas de maíz crujientes: carne mechada, queso llanero, pollo y cazón fresco.', 'assets/product_empanadas.webp', 'Surtidas, Solo Queso, Solo Carne', 1),
('combo-parrillero', 'Combo Parrillero Familiar', 'combos', 'combos', 28.00, 'users', 'Para 3-4 personas: Carne de res a la parrilla, pollo asado, chorizo ahumado, yuca con mojo, ensalada y guasacaca.', 'assets/product_parrilla.webp', 'Familiar 4 personas, Pareja 2 personas (-10$)', 1),
('quesillo-casero', 'Quesillo Tradicional Venezolano', 'postres', 'postres', 4.00, 'cake', 'Postre cremoso a base de huevos, leche condensada y vainilla, cubierto con un rico caramelo dorado hecho a mano.', 'assets/product_quesillo.webp', 'Porción individual', 1),
('tres-leches', 'Torta Tres Leches', 'postres', 'postres', 4.50, 'cake', 'Bizcocho esponjoso empapado en nuestra mezcla especial de tres leches, coronado con merengue suave y canela.', 'assets/product_tresleches.webp', 'Porción individual', 1),
('papelon-limon', 'Papelón con Limón (500ml)', 'bebidas', 'bebidas', 2.50, 'cup-soda', 'La bebida criolla por excelencia. Panela de papelón disuelta con abundante jugo de limón fresco y mucho hielo.', 'assets/product_papelon.webp', 'Vaso 500ml, Jarra 1.5L (+3$)', 1);

-- Usuario Administrador por Defecto
INSERT OR IGNORE INTO users (id, username, password_hash, password_salt) 
VALUES (1, 'admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', NULL);
