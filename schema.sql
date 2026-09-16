-- Esquema de Base de Datos - FOGÓN Restaurante Venezolano

-- Tabla de Tipos de Producto (Ramas de productos)
CREATE TABLE IF NOT EXISTS product_types (
    id TEXT PRIMARY KEY, -- 'apparel', 'mug', 'sticker', 'accessory', etc.
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
    sizes TEXT, -- Tallas separadas por comas (para compatibilidad)
    type_id TEXT REFERENCES product_types(id), -- Rama asociada
    active INTEGER NOT NULL DEFAULT 1, -- 1 = Activo, 0 = Inactivo
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Atributos de Producto por Instancia
CREATE TABLE IF NOT EXISTS product_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    attr_key TEXT NOT NULL,       -- Ej: 'color', 'finish', 'capacity'
    attr_label TEXT NOT NULL,     -- Ej: 'Color', 'Acabado', 'Capacidad'
    attr_values TEXT NOT NULL,    -- JSON array de valores válidos: ["Blanco","Negro"]
    attr_type TEXT DEFAULT 'select', -- 'select', 'color_swatch', 'toggle'
    price_matrix TEXT DEFAULT '{}',  -- JSON object con deltas de precio: {"XL": 1.5, "XXL": 2.0}
    required INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Tabla de Variantes/Opciones de Producto (Para stock e identificadores únicos opcionales)
CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    sku TEXT,
    label TEXT NOT NULL,          -- Ej: 'Talla M, Color Rojo' o 'Mate, 11oz'
    price_delta REAL DEFAULT 0.0,
    stock INTEGER DEFAULT -1,     -- -1 = Ilimitado
    active INTEGER DEFAULT 1,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Tabla de Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, -- ID único del pedido (ej: SUB-XXXX)
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    delivery_type TEXT NOT NULL DEFAULT 'delivery', -- 'delivery' o 'retiro'
    delivery_address TEXT,
    delivery_notes TEXT,
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
    size TEXT, -- Talla o variante seleccionada (opcional)
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

-- Insertar tipos de productos (categorías del menú)
INSERT OR REPLACE INTO product_types (id, name, description, icon, attributes) VALUES
('entradas',    'Entradas',          'Piqueos y entradas del menú FOGÓN',         'salad',     '[{"key":"cantidad","label":"Cantidad","type":"select","values":["Porción personal","Porción doble"]}]'),
('principales', 'Platos Principales','Platos fuertes con sabrosa sazón venezolana', 'utensils',  '[{"key":"proteina","label":"Proteína","type":"select","values":["Res","Pollo","Cerdo","Mixto"]},{"key":"punto","label":"Punto de Coccción","type":"select","values":["Vuelta y Vuelta","Tres Cuartos","Bien Cocido"]}]'),
('combos',      'Combos',            'Combos familiares y promociones del día',     'package-2', '[{"key":"size","label":"Tamaño","type":"select","values":["Para 2","Familiar (4 pers)","Mega (6 pers)"]}]'),
('postres',     'Postres',           'Postres artesanales y dulces venezolanos',    'cake',      '[]'),
('bebidas',     'Bebidas',           'Jugos naturales, refrescos y bebidas frías',  'cup-soda',  '[{"key":"tamaño","label":"Tamaño","type":"select","values":["Vaso 12oz","Vaso 16oz","Litro"]}]');

-- Insertar platillos del menú de FOGÓN
INSERT OR REPLACE INTO products (id, name, description, price, category, icon, image_url, sizes, type_id, active) VALUES
-- Entradas
('tequenos-queso',    'Tequeños con Guasacaca',      'Masa de tequeño crocante rellena de queso blanco derretido. Acompañados de nuestra guasacaca artesanal. Porción de 8 unidades.',  8.0,  'entradas',    'salad',    'assets/product_tequenos.webp',    NULL, 'entradas',    1),
('empanadas-mechada', 'Empanadas de Carne Mechada',  'Empanadas de maíz fritas con relleno de jugosa carne mechada criolla. Crujientes por fuera, tiernas por dentro. Porción de 3 unidades.', 7.0,  'entradas',    'salad',    'assets/product_empanadas.webp',   NULL, 'entradas',    1),
-- Platos Principales
('pabellon-criollo',  'Pabellón Criollo',            'El plato insignia venezolano. Carne mechada sazonada al sofrito, caraotas negras cremosas, arroz blanco y tajadas de plátano maduro frito. 100% casero.',  14.0, 'principales', 'utensils', 'assets/product_pabellon.webp',    NULL, 'principales', 1),
('pollo-plancha',     'Pollo a la Plancha',           'Jugosa pechuga de pollo a la plancha con especias criollas y marca de parrilla perfecta. Servida con arroz, ensalada y tostones.',  12.0, 'principales', 'utensils', 'assets/product_pollo_plancha.webp', NULL, 'principales', 1),
('churrasco-fogon',   'Churrasco al Fogón',          'Corte de res selecto a la parrilla con marca de fuego y jugosidad interna. Servido en tabla de madera con chimichurri casero y yuca frita.',  18.0, 'principales', 'utensils', 'assets/product_churrasco.webp',   NULL, 'principales', 1),
-- Combos
('combo-familiar',    'Combo Familiar FOGÓN',        'El favorito de las familias. Incluye pabellón criollo para 4 personas, arepas, ensalada familiar, caraotas y tajadas. ¡Ideal para compartir!',  45.0, 'combos',      'package-2','assets/product_combo_familiar.webp', NULL, 'combos',      1),
-- Postres
('quesillo-casero',   'Quesillo Casero',              'Flan venezolano tradicional de textura sedosa, bañado en caramelo dorado hecho en casa. La receta de la abuela de siempre.',  5.0,  'postres',     'cake',     'assets/product_quesillo.webp',    NULL, 'postres',     1),
('tres-leches',       'Torta Tres Leches',            'Bizcocho esponjoso empapado en mezcla de tres leches, cubierto de crema chantilly y una cereza. El postre que enamora.',  6.0,  'postres',     'cake',     'assets/product_tres_leches.webp', NULL, 'postres',     1),
-- Bebidas
('jugo-natural',      'Jugo Natural del Día',         'Jugo fresco preparado al momento con frutas tropicales de temporada: maracuyá, tamarindo, parchíta, mango o guayaba. Selecciona tu favorita.',  3.5,  'bebidas',     'cup-soda', 'assets/product_bebidas.webp',     NULL, 'bebidas',     1),
-- Más Entradas
('mandocas-queso',    'Mandocas con Queso',          'Anillos fritos de masa de maíz con plátano maduro, panela y especias, coronadas con queso blanco rallado. Porción de 5 unidades.', 6.0,  'entradas',    'salad',    'assets/product_mandocas.webp', NULL, 'entradas', 1),
('arepitas-nata',     'Mini Arepitas con Nata',      'Arepitas fritas abombadas y crujientes, acompañadas de fresca nata criolla para untar. Porción de 10 unidades.', 5.5,  'entradas',    'salad',    'assets/product_arepitas.webp', NULL, 'entradas', 1),
('patacones-carne',   'Patacones de Carne',          'Tostones de plátano verde crujiente cubiertos de carne mechada, queso rallado, lechuga y salsa rosada. Porción de 2 unidades.', 9.0,  'entradas',    'salad',    'assets/product_patacones.webp', NULL, 'entradas', 1),
('tostones-playeros', 'Tostones Playeros',           'Rodajas gruesas de plátano verde frito, coronados con ensalada rallada, queso blanco y salsas típicas.', 7.0,  'entradas',    'salad',    'assets/product_tostones_playeros.webp', NULL, 'entradas', 1),
-- Más Principales
('asado-negro',       'Asado Negro Caraqueño',       'Corte de muchacho redondo cocido a fuego lento en una rica salsa de papelón oscuro y vino. Servido con puré y arroz.', 16.0, 'principales', 'utensils', 'assets/product_asado_negro.webp', NULL, 'principales', 1),
('sopa-res',          'Sopa de Res Cruzado',         'Potente caldo de costilla de res con verduras surtidas (yuca, ñame, ocumo, auyama) y un toque de cilantro fresco.', 10.0, 'principales', 'utensils', 'assets/product_sopa_res.webp', NULL, 'principales', 1),
('cachapa-queso',     'Cachapa con Queso de Mano',   'Tortilla gruesa y dulce de maíz tierno, rellena generosamente de queso de mano derretido, bañada en mantequilla.', 11.0, 'principales', 'utensils', 'assets/product_cachapa.webp', NULL, 'principales', 1),
('arepa-reina',       'Arepa Reina Pepiada',         'Nuestra famosa arepa asada rellena de una cremosa mezcla de pollo desmechado, aguacate y mayonesa. Un clásico.', 8.5, 'principales', 'utensils', 'assets/product_arepa_reina.webp', NULL, 'principales', 1),
('arepa-pelua',       'Arepa Pelúa',                 'Arepa asada rellena de jugosa carne mechada y abundante queso amarillo rallado.', 8.5, 'principales', 'utensils', 'assets/product_arepa_pelua.webp', NULL, 'principales', 1),
('hervido-gallina',   'Hervido de Gallina',          'Consomé tradicional de gallina con verduras enteras. Ideal para recargar energías, servido con arepitas.', 10.0, 'principales', 'utensils', 'assets/product_hervido_gallina.webp', NULL, 'principales', 1),
-- Más Combos
('combo-pareja',      'Combo Enamorados',            'Para dos: 1 Parrilla mixta mediana, 2 raciones de tequeños y 2 bebidas a elección.', 28.0, 'combos', 'package-2', 'assets/product_combo_pareja.webp', NULL, 'combos', 1),
('combo-arepero',     'Mega Combo Arepero',          'Degustación de 4 arepas (Reina, Pelúa, Dominó, Sifrina) con una ración de nata extra y 4 bebidas.', 35.0, 'combos', 'package-2', 'assets/product_combo_arepero.webp', NULL, 'combos', 1),
-- Más Postres
('marquesa-choco',    'Marquesa de Chocolate',       'Postre frío de capas de galleta María intercaladas con una suave y rica crema de chocolate.', 5.5, 'postres', 'cake', 'assets/product_marquesa_choco.webp', NULL, 'postres', 1),
('golfeados',         'Golfeados con Queso',         'Panecillos dulces enrollados con papelón, anís y queso, coronados con un generoso trozo de queso de mano.', 4.5, 'postres', 'cake', 'assets/product_golfeados.webp', NULL, 'postres', 1),
-- Más Bebidas
('papelon-limon',     'Papelón con Limón',           'Refrescante bebida tradicional de panela (papelón) con el toque perfecto de acidez del limón criollo.', 2.5, 'bebidas', 'cup-soda', 'assets/product_papelon_limon.webp', NULL, 'bebidas', 1),
('chicha-venezolana', 'Chicha Venezolana',           'Bebida espesa y dulce a base de arroz y leche, servida muy fría con abundante hielo, canela y leche condensada.', 4.0, 'bebidas', 'cup-soda', 'assets/product_chicha.webp', NULL, 'bebidas', 1);


-- Insertar usuario admin inicial (contraseña por defecto: "admin123" usando hash SHA-256 legacy)
INSERT OR REPLACE INTO users (username, password_hash, password_salt) VALUES
('admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', NULL);

