// --- CONFIGURACIÓN GLOBAL DEL NEGOCIO ---
const CONFIG = {
    WHATSAPP_NUMBER: "584124756191", // Formato internacional sin caracteres especiales (ej: 584124756191)
    DEFAULT_CURRENCY: "$"
};

// Scroll Reveal Animation — IntersectionObserver con configuración optimizada
const initReveal = () => {
    const reveals = document.querySelectorAll('.reveal:not(.active)');
    if (reveals.length === 0) return;

    const observerOptions = {
        root: null,
        // rootMargin negativo: el elemento debe estar visible al menos 50px
        // antes de activarse — evita disparos prematuros en scroll rápido
        rootMargin: '-50px 0px -50px 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                obs.unobserve(entry.target);
            }
        });
    }, observerOptions);

    reveals.forEach(el => observer.observe(el));
};

// Navbar scroll effect — limitado con requestAnimationFrame para no bloquear el hilo principal
const header = document.querySelector('.glass-nav');
if (header) {
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                if (window.scrollY > 50) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            window.scrollTo({
                top: target.offsetTop - 80,
                behavior: 'smooth'
            });
        }
    });
});

// Hero Slider Logic
const initSlider = () => {
    const slides = document.querySelectorAll('.slide');
    if (slides.length === 0) return;

    let currentSlide = 0;
    const slideInterval = 5000; // 5 seconds per slide

    const nextSlide = () => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    };

    setInterval(nextSlide, slideInterval);
};

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const icon = mobileMenuBtn.querySelector('i');
        if (navLinks.classList.contains('active')) {
            icon.setAttribute('data-lucide', 'x');
        } else {
            icon.setAttribute('data-lucide', 'menu');
        }
        lucide.createIcons();
    });

    // Close menu when clicking a link
    const links = navLinks.querySelectorAll('a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            mobileMenuBtn.querySelector('i').setAttribute('data-lucide', 'menu');
            lucide.createIcons();
        });
    });
}

// --- Shopping Cart Logic ---

let cart = JSON.parse(localStorage.getItem('fogon_cart')) || [];

const cartBtn = document.getElementById('cart-btn');
const closeCartBtn = document.getElementById('close-cart');
const cartDrawer = document.getElementById('cart-drawer');
const cartOverlay = document.getElementById('cart-overlay');
const cartItemsContainer = document.getElementById('cart-items');
const cartCountBadge = document.getElementById('cart-count');
const whatsappOrderBtn = document.getElementById('whatsapp-order-btn');
const clearCartBtn = document.getElementById('clear-cart');

const confirmModal = document.getElementById('confirm-modal');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

// Toggle Cart
const toggleCart = () => {
    cartDrawer.classList.toggle('active');
    cartOverlay.classList.toggle('active');
    if (cartDrawer.classList.contains('active')) {
        renderCart();
    }
};

if (cartBtn) cartBtn.addEventListener('click', toggleCart);
if (closeCartBtn) closeCartBtn.addEventListener('click', toggleCart);
if (cartOverlay) cartOverlay.addEventListener('click', toggleCart);

// Custom Confirm Modal Logic
const showConfirmModal = () => {
    if (cart.length === 0) return;
    confirmModal.classList.add('active');
};

const hideConfirmModal = () => {
    confirmModal.classList.remove('active');
};

if (clearCartBtn) clearCartBtn.addEventListener('click', showConfirmModal);
if (modalCancel) modalCancel.addEventListener('click', hideConfirmModal);
if (confirmModal) confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) hideConfirmModal();
});

if (modalConfirm) modalConfirm.addEventListener('click', () => {
    cart = [];
    saveCart();
    renderCart();
    updateCartCount();
    hideConfirmModal();
    showToast('Carrito vaciado');
});

// Add to Cart
// Icon Mapping Fallback for existing items
const iconMap = {
    "Blusa Floral": "shirt",
    "Vestido Midi": "sparkles",
    "Pantalón de Moda": "shirt",
    "Cartera Premium": "shopping-bag",
    "Bolso Crossbody": "shopping-bag",
    "Set de Maquillaje": "sparkles",
    "Labial Premium": "sparkles",
    "Aretes Dorados": "gem",
    "Collar Delicado": "gem"
};

const addToCart = (id, name, price, quantity = 1, icon = 'package', options = {}) => {
    const qty = parseInt(quantity);

    // Crear llave única basada en id y opciones ordenadas consistentemente
    const sortedOptionValues = Object.keys(options).sort().map(k => options[k]);
    const optionsKey = sortedOptionValues.join('-');
    const itemKey = optionsKey ? `${id}-${optionsKey}` : id;

    const existingItem = cart.find(item => item.key === itemKey);

    // Usar icono mapeado si el icono provisto es el genérico
    const finalIcon = (icon === 'package' && iconMap[name]) ? iconMap[name] : icon;

    if (existingItem) {
        existingItem.qty += qty;
    } else {
        cart.push({ key: itemKey, name, price: price, qty: qty, icon: finalIcon, options: options });
    }
    saveCart();
    updateCartCount();

    let optionText = "";
    const optionList = Object.entries(options).filter(([_, v]) => v).map(([_, v]) => v);
    if (optionList.length > 0) {
        optionText = ` (${optionList.join(', ')})`;
    }
    showToast(`¡Añadido ${qty}x ${name}${optionText}!`);
};

// Toast System
const showToast = (message) => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Limpiar toasts anteriores para no acumular
    container.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <i data-lucide="check-circle" style="color: #25D366"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    // Diferir createIcons al siguiente frame para no bloquear
    requestAnimationFrame(() => lucide.createIcons({ nodes: [toast] }));

    // Remove toast after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
};

// Remove from Cart
const removeFromCart = (key) => {
    cart = cart.filter(item => item.key !== key);
    saveCart();
    renderCart();
    updateCartCount();
};

// Update Qty
const updateQty = (key, delta) => {
    const item = cart.find(item => item.key === key);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            removeFromCart(key);
        } else {
            saveCart();
            renderCart();
            updateCartCount();
        }
    }
};

// Save to LocalStorage
const saveCart = () => {
    localStorage.setItem('fogon_cart', JSON.stringify(cart));
};

// Update Badge Count
const updateCartCount = () => {
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    
    if (cartCountBadge) {
        cartCountBadge.textContent = totalItems;
    }

    if (cartBtn) {
        if (totalItems > 0) {
            cartBtn.classList.add('visible');
        } else {
            cartBtn.classList.remove('visible');
        }
    }
};

// Render Cart UI
const renderCart = () => {
    if (!cartItemsContainer) return;

    const customerForm = document.getElementById('cart-customer-form');

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<div class="empty-cart-msg">Tu carrito está vacío</div>';
        if (whatsappOrderBtn) whatsappOrderBtn.disabled = true;
        if (customerForm) customerForm.style.display = 'none';
        return;
    }

    if (whatsappOrderBtn) whatsappOrderBtn.disabled = false;
    if (customerForm) customerForm.style.display = 'block';

    let html = cart.map(item => {
        const icon = item.icon && item.icon !== 'package' ? item.icon : (iconMap[item.name] || 'package');
        
        let sizeText = "";
        if (item.options && typeof item.options === 'object') {
            const labels = {
                size: 'Talla',
                color: 'Color',
                finish: 'Acabado',
                capacity: 'Capacidad'
            };
            sizeText = Object.entries(item.options)
                .filter(([_, v]) => v)
                .map(([k, v]) => `<span class="cart-item-option">${labels[k] || k.charAt(0).toUpperCase() + k.slice(1)}: ${v}</span>`)
                .join('');
        }

        return `
            <div class="cart-item">
                <div class="item-info">
                    <div class="item-title-row">
                        <i data-lucide="${icon}" class="item-icon"></i>
                        <div class="item-details">
                            <h4>${item.name}</h4>
                            <div style="display: flex; flex-direction: column; gap: 0.2rem; margin-top: 0.2rem;">
                                ${sizeText}
                                <span style="font-weight: 600; color: var(--accent);">$${item.price > 0 ? (item.price * item.qty).toFixed(2) : 'A consultar'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="item-qty">
                    <button class="qty-btn" onclick="updateQty('${item.key || item.name}', -1)">-</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty('${item.key || item.name}', 1)">+</button>
                    <button class="remove-item" onclick="removeFromCart('${item.key || item.name}')">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    const totalPrice = cart.reduce((sum, item) => sum + ((item.price || 0) * item.qty), 0);

    html += `
        <div class="cart-total" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; margin-top: 1rem; border-top: 1px solid rgba(0,0,0,0.1); font-weight: bold; font-size: 1.2rem;">
            <span>Total:</span>
            <span style="color: var(--accent);">$${totalPrice.toFixed(2)}</span>
        </div>
    `;

    cartItemsContainer.innerHTML = html;

    // Diferir createIcons al siguiente frame para no bloquear el hilo principal
    requestAnimationFrame(() => lucide.createIcons());
};

// Delivery type toggle logic
const deliveryTypeRadios = document.querySelectorAll('input[name="delivery-type"]');
const deliveryFieldsContainer = document.getElementById('delivery-fields-container');

if (deliveryTypeRadios.length > 0 && deliveryFieldsContainer) {
    deliveryTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'delivery') {
                deliveryFieldsContainer.style.display = 'block';
            } else {
                deliveryFieldsContainer.style.display = 'none';
            }
        });
    });
}

// Send Order to Backend and redirect to WhatsApp
if (whatsappOrderBtn) {
    whatsappOrderBtn.addEventListener('click', async () => {
        const clientNameInput = document.getElementById('client-name');
        const clientPhoneInput = document.getElementById('client-phone');
        const deliveryTypeInput = document.querySelector('input[name="delivery-type"]:checked');
        const deliveryAddressInput = document.getElementById('delivery-address');
        const deliveryNotesInput = document.getElementById('delivery-notes');
        
        const clientName = clientNameInput ? clientNameInput.value.trim() : "";
        const clientPhone = clientPhoneInput ? clientPhoneInput.value.trim() : "";
        const deliveryType = deliveryTypeInput ? deliveryTypeInput.value : "delivery";
        const deliveryAddress = deliveryAddressInput ? deliveryAddressInput.value.trim() : "";
        const deliveryNotes = deliveryNotesInput ? deliveryNotesInput.value.trim() : "";

        if (!clientName || !clientPhone) {
            showToast('⚠️ Ingresa tu nombre y teléfono.');
            if (!clientName && clientNameInput) clientNameInput.focus();
            else if (!clientPhone && clientPhoneInput) clientPhoneInput.focus();
            return;
        }

        if (deliveryType === 'delivery' && !deliveryAddress) {
            showToast('⚠️ Ingresa tu dirección de entrega.');
            if (deliveryAddressInput) deliveryAddressInput.focus();
            return;
        }

        // Deshabilitar botón durante proceso
        whatsappOrderBtn.disabled = true;
        whatsappOrderBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Registrando Pedido...';
        lucide.createIcons();

        try {
            // Guardar el pedido en el Backend (D1)
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    clientName,
                    clientPhone,
                    deliveryType,
                    deliveryAddress,
                    deliveryNotes,
                    items: cart
                })
            });

            if (!response.ok) throw new Error('Error al registrar pedido en servidor.');
            
            const result = await response.json();
            
            if (result.success) {
                const orderId = result.orderId;
                const phoneNumber = CONFIG.WHATSAPP_NUMBER;
                
                let deliveryInfoText = deliveryType === 'retiro' 
                    ? `*Método:* Retiro en Tienda`
                    : `*Método:* Delivery\n*Dirección:* ${deliveryAddress}${deliveryNotes ? `\n*Notas:* ${deliveryNotes}` : ''}`;
                
                let message = `¡Hola Fogon! 👋✨\n\nHe realizado un pedido en la web.\n*Número de Pedido:* #${orderId}\n*Cliente:* ${clientName} (${clientPhone})\n${deliveryInfoText}\n\n*Artículos del pedido:*\n`;

                let totalPrice = 0;
                cart.forEach(item => {
                    let optionsString = "";
                    if (item.options && typeof item.options === 'object') {
                        const entries = Object.entries(item.options).filter(([_, v]) => v);
                        if (entries.length > 0) {
                            const labels = {
                                size: 'Talla',
                                color: 'Color',
                                finish: 'Acabado',
                                capacity: 'Capacidad'
                            };
                            optionsString = " [" + entries.map(([k, v]) => `${labels[k] || k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join(', ') + "]";
                        }
                    }
                    const itemTotal = (item.price || 0) * item.qty;
                    totalPrice += itemTotal;
                    message += `✅ ${item.qty}x ${item.name}${optionsString} - ${item.price > 0 ? '$' + itemTotal.toFixed(2) : 'A consultar'}\n`;
                });

                const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
                message += `\n*Total de artículos:* ${totalItems}\n*Total a pagar:* $${totalPrice.toFixed(2)}\n\n📦 *Por favor confirmen disponibilidad y coordinen el envío. ¡Gracias!*`;

                // Vaciar carrito local
                cart = [];
                saveCart();
                updateCartCount();
                renderCart();
                
                // Limpiar campos de texto
                if (clientNameInput) clientNameInput.value = "";
                if (clientPhoneInput) clientPhoneInput.value = "";
                if (deliveryAddressInput) deliveryAddressInput.value = "";
                if (deliveryNotesInput) deliveryNotesInput.value = "";
                if (deliveryTypeRadios.length > 0) {
                    deliveryTypeRadios[0].checked = true; // Volver a delivery por defecto
                    if (deliveryFieldsContainer) deliveryFieldsContainer.style.display = 'block';
                }

                // Cerrar drawer
                toggleCart();

                // Mostrar éxito al usuario
                showToast(`🎉 ¡Pedido #${orderId} registrado con éxito!`);

                // Redirigir a WhatsApp
                const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            } else {
                throw new Error(result.error || 'Error desconocido del servidor.');
            }
        } catch (err) {
            console.error(err);
            showToast('❌ Error de conexión al registrar pedido. Intenta de nuevo.');
        } finally {
            whatsappOrderBtn.disabled = false;
            whatsappOrderBtn.innerHTML = '<i data-lucide="message-circle"></i> Enviar Pedido por WhatsApp';
            lucide.createIcons();
        }
    });
}

// --- VARIABLES GLOBALES DEL CATÁLOGO ---
let catalogProducts = [];
let activeCategory = 'all';

const categoryNames = {
    'all': 'Todo',
    'grill': 'Parrillas',
    'steaks': 'Cortes Premium',
    'burgers': 'Hamburguesas',
    'drinks': 'Bebidas'
};

const categoryIcons = {
    'all': 'layout-grid',
    'grill': 'flame',
    'steaks': 'beef',
    'burgers': 'sandwich',
    'drinks': 'cup-soda'
};

const colorMap = {
    'blanco': '#ffffff',
    'negro': '#1a1a1a',
    'rojo': '#e63946',
    'azul': '#1d3557',
    'amarillo': '#ffb703',
    'verde': '#2a9d8f',
    'rosado': '#ffb5a7',
    'gris': '#8d99ae'
};

// Render category filters dynamically based on active products
const renderCategoryFilters = (products) => {
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;

    const activeTypes = new Set(products.map(p => p.type_id).filter(Boolean));
    const typesToRender = ['all', ...Array.from(activeTypes)];

    filtersContainer.innerHTML = typesToRender.map(type => {
        const name = categoryNames[type] || type.charAt(0).toUpperCase() + type.slice(1);
        const icon = categoryIcons[type] || 'package';
        const isActive = activeCategory === type;

        return `
            <button class="category-filter-btn ${isActive ? 'active' : ''}" data-category="${type}">
                <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                ${name}
            </button>
        `;
    }).join('');

    requestAnimationFrame(() => lucide.createIcons());
};

// Category filters click event listener
const initCategoryFilters = () => {
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;

    filtersContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-filter-btn');
        if (!btn) return;

        const category = btn.getAttribute('data-category');
        activeCategory = category;

        filtersContainer.querySelectorAll('.category-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        renderProducts(catalogProducts);
    });
};

// Render dynamic products cards
const renderProducts = (products) => {
    const container = document.getElementById('catalog-container');
    if (!container) return;

    // Filtrar por categoría activa
    const filteredProducts = activeCategory === 'all'
        ? products
        : products.filter(p => p.type_id === activeCategory);

    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem 0; color: var(--text-secondary);">
                <p>No hay productos activos en esta categoría actualmente.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredProducts.map(p => {
        // Generar atributos dinámicos
        let attributesHtml = "";
        if (p.attributes && p.attributes.length > 0) {
            attributesHtml = p.attributes.map(attr => {
                let optionsHtml = "";
                if (attr.type === 'color_swatch') {
                    optionsHtml = `
                        <div class="color-swatch-container" data-attribute="${attr.key}" data-product="${p.id}">
                            ${attr.values.map((val, idx) => {
                                const hex = colorMap[val.toLowerCase().trim()] || val;
                                const isLight = ['blanco', 'amarillo', 'beige', 'white', 'yellow'].includes(val.toLowerCase().trim());
                                const lightClass = isLight ? 'light-color' : '';
                                return `
                                    <button class="color-swatch-btn ${idx === 0 ? 'active' : ''} ${lightClass}" 
                                        style="background-color: ${hex};" 
                                        data-value="${val}" 
                                        title="${val}"></button>
                                `;
                            }).join('')}
                        </div>
                    `;
                } else {
                    optionsHtml = `
                        <div class="attribute-selector" data-attribute="${attr.key}" data-product="${p.id}">
                            ${attr.values.map((val, idx) => `
                                <button class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${val}">${val}</button>
                            `).join('')}
                        </div>
                    `;
                }

                return `
                    <div class="attribute-options-group">
                        <label>${attr.label}:</label>
                        ${optionsHtml}
                    </div>
                `;
            }).join('');
        }

        // Tallas legadas fallback si no hay atributo size dinámico
        const legacySizesHtml = (p.sizes && (!p.attributes || !p.attributes.some(a => a.key === 'size'))) ? `
            <div class="attribute-options-group">
                <label>Talla:</label>
                <div class="attribute-selector" data-attribute="size" data-product="${p.id}">
                    ${p.sizes.split(',').map((size, idx) => `
                        <button class="attribute-btn ${idx === 0 ? 'active' : ''}" data-value="${size}">${size}</button>
                    `).join('')}
                </div>
            </div>
        ` : '';

        return `
            <div class="product-card reveal">
                <div class="product-img">
                    <img src="${p.image_url}" alt="${p.name}" loading="lazy">
                </div>
                <div class="product-info">
                    <div class="product-header">
                        <h3>${p.name}</h3>
                        <i data-lucide="${p.icon || 'package'}"></i>
                    </div>
                    <div class="product-price" style="font-size: 1.3rem; font-weight: 700; color: var(--accent); margin: 0.5rem 0 0.8rem 0; font-family: 'Outfit', sans-serif;">
                        ${p.price > 0 ? `$${parseFloat(p.price).toFixed(2)}` : 'A consultar'}
                    </div>
                    <p class="product-desc" style="min-height: auto; margin-bottom: 1.2rem;">${p.description || ''}</p>
                    ${attributesHtml}
                    ${legacySizesHtml}
                    <div class="product-actions">
                        <div class="main-qty-selector">
                            <button class="qty-btn-main minus" data-id="${p.id}">-</button>
                            <input type="number" value="1" min="1" id="qty-${p.id}" class="qty-input">
                            <button class="qty-btn-main plus" data-id="${p.id}">+</button>
                        </div>
                        <button class="cta-btn product-cta add-to-cart" 
                            data-id="${p.id}"
                            data-name="${p.name}" 
                            data-price="${p.price}"
                            data-input="qty-${p.id}" 
                            data-icon="${p.icon || 'package'}">Agregar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Diferir createIcons + reveal al siguiente frame (no bloquea el render principal)
    requestAnimationFrame(() => {
        lucide.createIcons();
        initReveal();
    });
};

// Fetch catalog from API
const fetchCatalog = async () => {
    try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error('Error al cargar catálogo');
        const products = await response.json();
        catalogProducts = products;
        renderCategoryFilters(products);
        renderProducts(products);
    } catch (err) {
        console.error(err);
        const container = document.getElementById('catalog-container');
        if (container) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem 0; color: #ff007f;">
                    <i data-lucide="alert-circle" style="margin-bottom: 1rem; width: 32px; height: 32px;"></i>
                    <p>Error al cargar el catálogo de productos. Por favor recarga la página.</p>
                </div>
            `;
            lucide.createIcons();
        }
    }
};

// Event delegation for dynamic catalog items
const initCatalogDelegation = () => {
    const container = document.getElementById('catalog-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
        // 1. Click en cualquier botón de opción (atributo o talla legada)
        const optionBtn = e.target.closest('.attribute-btn, .color-swatch-btn');
        if (optionBtn) {
            const selector = optionBtn.parentElement;
            selector.querySelectorAll('.attribute-btn, .color-swatch-btn').forEach(btn => btn.classList.remove('active'));
            optionBtn.classList.add('active');
            return;
        }

        // 2. Click en botones de cantidad del catálogo (+/-)
        const qtyBtn = e.target.closest('.qty-btn-main');
        if (qtyBtn) {
            const id = qtyBtn.getAttribute('data-id');
            const input = document.getElementById(`qty-${id}`);
            if (input) {
                let val = parseInt(input.value) || 1;
                if (qtyBtn.classList.contains('plus')) {
                    val++;
                } else if (qtyBtn.classList.contains('minus') && val > 1) {
                    val--;
                }
                input.value = val;
            }
            return;
        }

        // 3. Click en Agregar al Carrito
        const addBtn = e.target.closest('.add-to-cart');
        if (addBtn) {
            const productId = addBtn.getAttribute('data-id');
            const productName = addBtn.getAttribute('data-name');
            const productPrice = parseFloat(addBtn.getAttribute('data-price')) || 0;
            const inputId = addBtn.getAttribute('data-input');
            const iconName = addBtn.getAttribute('data-icon');
            const input = document.getElementById(inputId);
            const quantity = input ? parseInt(input.value) || 1 : 1;

            const options = {};
            const productCard = addBtn.closest('.product-card');
            if (productCard) {
                const activeSelectors = productCard.querySelectorAll('[data-attribute]');
                activeSelectors.forEach(selector => {
                    const attrKey = selector.getAttribute('data-attribute');
                    const activeBtn = selector.querySelector('.active');
                    if (activeBtn) {
                        const val = activeBtn.getAttribute('data-value');
                        if (val) {
                            options[attrKey] = val;
                        }
                    }
                });
            }

            addToCart(productId, productName, productPrice, quantity, iconName, options);

            // Resetear cantidad a 1
            if (input) input.value = 1;
        }
    });
};

// Initial load
window.addEventListener('load', () => {
    initReveal();
    initSlider();
    fetchCatalog();
    initCategoryFilters();
    initCatalogDelegation();
    updateCartCount();
});

// Expose functions to global scope for onclick handlers
window.updateQty = updateQty;
window.removeFromCart = removeFromCart;
