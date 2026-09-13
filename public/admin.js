// Lógica del Panel Administrativo - ÉLARA

// Variables de estado
let currentAdmin = null;
let ordersList = [];
let productsList = [];
let salesList = [];

// Elementos del DOM
const loader = document.getElementById('page-loader');
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');
const toastContainer = document.getElementById('toast-container');

// Navegación Sidebar
const sidebarLinks = document.querySelectorAll('.sidebar-link[data-target]');
const sections = document.querySelectorAll('.dashboard-section');
const dashboardTitle = document.getElementById('dashboard-title');
const dashboardSubtitle = document.getElementById('dashboard-subtitle');

// Formularios e Inventario
const productForm = document.getElementById('product-form');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const formProductTitle = document.getElementById('form-product-title');
const btnSubmitProduct = document.getElementById('btn-submit-product');

// Modal Detalles Pedido
const orderModal = document.getElementById('order-detail-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCloseModalFooter = document.getElementById('btn-modal-close-footer');

// Modal Registrar Pago
const paymentModal = document.getElementById('payment-modal');
const btnClosePaymentModal = document.getElementById('btn-close-payment-modal');
const btnCancelPaymentModal = document.getElementById('btn-cancel-payment-modal');
const paymentForm = document.getElementById('payment-form');
const paymentMethodSelect = document.getElementById('payment-method-select');
const paymentReferenceInput = document.getElementById('payment-reference');
const referenceGroup = document.getElementById('reference-group');
const paymentModalOrderId = document.getElementById('payment-modal-order-id');

let pendingPaymentOrderId = null;
let pendingPaymentStatus = null;


// --- HASHING DE CONTRASEÑA ---
/**
 * Hashea una contraseña usando SHA-256 nativo del navegador (hexadecimal)
 * @param {string} password 
 */
async function sha256(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// --- SISTEMA DE TOASTS (NOTIFICACIONES) ---
/**
 * Muestra una notificación flotante premium
 * @param {string} message 
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
function showToast(message, type = 'success') {
    if (toastContainer) {
        toastContainer.innerHTML = '';
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';
    if (type === 'warning') icon = 'alert-circle';
    if (type === 'info') icon = 'info';

    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// --- VERIFICACIÓN DE SESIÓN INICIAL ---
async function checkSession() {
    try {
        const res = await fetch('/api/auth');
        const data = await res.json();

        if (data.authenticated) {
            currentAdmin = data.username;
            showDashboard();
        } else {
            showLogin();
        }
    } catch (err) {
        console.error("Error verificando sesión inicial:", err);
        showLogin();
    } finally {
        hideLoader();
    }
}

function showLogin() {
    if (loginContainer) {
        loginContainer.style.display = 'flex';
        if (dashboardContainer) dashboardContainer.style.display = 'none';
    } else {
        window.location.href = '/login';
    }
}

function showDashboard() {
    if (loginContainer) loginContainer.style.display = 'none';
    if (dashboardContainer) dashboardContainer.style.display = 'flex';
    
    // Mostrar insignia de admin
    const badge = document.getElementById('user-info-badge');
    const badgeName = document.getElementById('admin-user-name');
    if (badge && badgeName && currentAdmin) {
        badge.style.display = 'block';
        badgeName.textContent = currentAdmin.charAt(0).toUpperCase() + currentAdmin.slice(1);
    }

    // Cargar datos
    refreshAllData();
}

function hideLoader() {
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

// --- FLUJO DE INICIO Y CIERRE DE SESIÓN ---

// Login Submit
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('login-username').value.trim();
        const passwordPlain = document.getElementById('login-password').value;
        const submitBtn = document.getElementById('login-btn-submit');

        if (!username || !passwordPlain) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Verificando...';
        lucide.createIcons();

        try {
            // Hashear contraseña localmente
            const passwordHash = await sha256(passwordPlain);

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, passwordHash })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                currentAdmin = data.username;
                showToast(`¡Bienvenido de vuelta, ${currentAdmin}! 👋`, 'success');
                showDashboard();
                loginForm.reset();
            } else {
                showToast(data.error || 'Credenciales inválidas', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de conexión al servidor.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i data-lucide="shield-check"></i> Ingresar al Panel';
            lucide.createIcons();
        }
    });
}

// Logout Click
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/auth', { method: 'DELETE' });
            if (res.ok) {
                currentAdmin = null;
                showToast('Sesión cerrada con éxito.', 'info');
                showLogin();
            } else {
                showToast('No se pudo cerrar la sesión correctamente.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de conexión al cerrar sesión.', 'error');
        }
    });
}

// --- NAVEGACIÓN EN EL PANEL ---
sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
        sidebarLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const targetSectionId = link.getAttribute('data-target');
        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(targetSectionId).classList.add('active');

        // Actualizar títulos del Header principal
        if (targetSectionId === 'section-metrics') {
            dashboardTitle.textContent = 'Métricas Generales';
            dashboardSubtitle.textContent = 'Control de ventas, catálogo y procesamiento de pedidos en tiempo real.';
        } else if (targetSectionId === 'section-orders') {
            dashboardTitle.textContent = 'Gestión de Pedidos';
            dashboardSubtitle.textContent = 'Revisa detalles, controla procesos y cambia el estado de tus solicitudes.';
            loadOrders();
        } else if (targetSectionId === 'section-sales') {
            dashboardTitle.textContent = 'Registro de Ventas';
            dashboardSubtitle.textContent = 'Consulta y analiza el histórico de cobros y pagos recibidos por los pedidos completados.';
            loadSales();
        } else if (targetSectionId === 'section-inventory') {
            dashboardTitle.textContent = 'Inventario & Catálogo';
            dashboardSubtitle.textContent = 'Crea nuevos productos, actualiza precios, cambia visibilidad o edita información.';
            loadProducts();
        }
    });
});

// Enlace "Ver todos" de la pestaña métricas
document.querySelectorAll('.view-all-orders-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const ordersTab = document.querySelector('.sidebar-link[data-target="section-orders"]');
        if (ordersTab) ordersTab.click();
    });
});

// --- CARGA Y RENDERIZACIÓN DE DATOS ---

async function refreshAllData() {
    await Promise.all([
        loadOrders(),
        loadProducts(),
        loadSales()
    ]);
    renderMetrics();
}

// 1. Cargar Pedidos de la API
async function loadOrders() {
    try {
        const res = await fetch('/api/orders');
        if (!res.ok) throw new Error('No autorizado');
        ordersList = await res.json();
        renderOrders();
    } catch (err) {
        console.error(err);
        showToast('Error al cargar pedidos del servidor.', 'error');
    }
}

// 2. Cargar Productos de la API (incluye inactivos)
async function loadProducts() {
    try {
        const res = await fetch('/api/products?admin=true');
        if (!res.ok) throw new Error('No autorizado');
        productsList = await res.json();
        renderProductsTable();
    } catch (err) {
        console.error(err);
        showToast('Error al cargar productos del servidor.', 'error');
    }
}

// 2.5 Cargar Registro de Ventas de la API
async function loadSales() {
    try {
        const res = await fetch('/api/sales');
        if (!res.ok) throw new Error('No autorizado');
        salesList = await res.json();
        renderSales();
    } catch (err) {
        console.error(err);
        showToast('Error al cargar ventas del servidor.', 'error');
    }
}

function renderSales() {
    const tableSales = document.getElementById('table-all-sales');
    const salesTotalSpan = document.getElementById('sales-total-amount');

    // Calcular monto total de forma segura convirtiendo a flotante para evitar concatenación
    const totalAmount = salesList.reduce((sum, s) => sum + (parseFloat(s.monto) || 0), 0);
    if (salesTotalSpan) {
        salesTotalSpan.textContent = `(Total Facturado: $${totalAmount.toFixed(2)})`;
    }

    if (!tableSales) return;

    if (salesList.length === 0) {
        tableSales.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No se han registrado ventas completadas todavía.</td></tr>`;
        return;
    }

    tableSales.innerHTML = salesList.map(s => {
        const dateObj = new Date(s.fecha);
        const dateString = dateObj.toLocaleDateString('es-VE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const montoVal = parseFloat(s.monto) || 0.0;

        return `
            <tr>
                <td><strong>#V-${s.id}</strong></td>
                <td><code style="font-weight: 700; color: var(--primary);">${s.order_id}</code></td>
                <td>${s.client_name}</td>
                <td>${s.client_phone}</td>
                <td style="font-weight: 700; color: var(--success);">$${montoVal.toFixed(2)}</td>
                <td><span style="background: rgba(34, 197, 94, 0.1); color: var(--success); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">${s.metodo_pago}</span></td>
                <td style="font-size: 0.85rem; color: var(--text-secondary);">${dateString}</td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}

// --- RENDER DE MÉTRICAS ---
function renderMetrics() {
    // Total de productos
    const metricProdCount = document.getElementById('metric-prod-count');
    if (metricProdCount) metricProdCount.textContent = productsList.length;

    // Pedidos pendientes y en producción
    const pendingOrders = ordersList.filter(o => o.status === 'pendiente');
    const prodOrders = ordersList.filter(o => o.status === 'en_produccion');
    
    const metricPending = document.getElementById('metric-pending-orders');
    if (metricPending) metricPending.textContent = pendingOrders.length;

    const metricProd = document.getElementById('metric-prod-orders');
    if (metricProd) metricProd.textContent = prodOrders.length;

    // Métricas de ventas registradas (Pedidos completados)
    const completedOrders = ordersList.filter(o => o.status === 'completado');
    const metricSalesCount = document.getElementById('metric-sales-count');
    
    if (metricSalesCount) {
        // En Venezuela a veces los precios son cotizados (0.00), sumamos el valor real si existe de forma segura
        const totalSalesSum = completedOrders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
        if (totalSalesSum > 0) {
            metricSalesCount.textContent = `$${totalSalesSum.toFixed(2)}`;
        } else {
            metricSalesCount.textContent = completedOrders.length; // Si son todos de cotizar, muestra contador
        }
    }
}

// --- CONTROL Y RENDER DE PEDIDOS ---

function renderOrders() {
    const tableAll = document.getElementById('table-all-orders');
    const tableRecent = document.getElementById('table-recent-orders');

    // Calcular totalizaciones de forma segura evitando concatenaciones de cadenas
    const totalOrdersSum = ordersList.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
    const nonCancelledOrders = ordersList.filter(o => o.status !== 'cancelado');
    const activeOrdersSum = nonCancelledOrders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);

    const summarySpan = document.getElementById('orders-total-summary');
    if (summarySpan) {
        summarySpan.textContent = `(Monto Total: $${totalOrdersSum.toFixed(2)} | Activos: $${activeOrdersSum.toFixed(2)})`;
    }

    // 1. Render en tabla general
    if (tableAll) {
        if (ordersList.length === 0) {
            tableAll.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No hay pedidos en la base de datos.</td></tr>`;
        } else {
            tableAll.innerHTML = ordersList.map(o => createOrderRowMarkup(o)).join('');
        }
    }

    // 2. Render en tabla recientes (máximo 5)
    if (tableRecent) {
        if (ordersList.length === 0) {
            tableRecent.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No hay pedidos recientes.</td></tr>`;
        } else {
            const recent = ordersList.slice(0, 5);
            tableRecent.innerHTML = recent.map(o => createOrderRowMarkup(o, false)).join('');
        }
    }

    lucide.createIcons();
}

function createOrderRowMarkup(order, includeStatusSelector = true) {
    const dateObj = new Date(order.created_at);
    const dateString = dateObj.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const priceText = order.total_price > 0 ? `$${order.total_price.toFixed(2)}` : 'Cotización';
    
    let statusSelector = '';
    if (includeStatusSelector) {
        statusSelector = `
            <select class="status-select" onchange="updateOrderStatus('${order.id}', this.value)">
                <option value="pendiente" ${order.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="en_produccion" ${order.status === 'en_produccion' ? 'selected' : ''}>En Producción</option>
                <option value="listo_entrega" ${order.status === 'listo_entrega' ? 'selected' : ''}>Listo para Entrega</option>
                <option value="completado" ${order.status === 'completado' ? 'selected' : ''}>Completado</option>
                <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
        `;
    } else {
        statusSelector = `<span class="status-badge ${order.status}">${order.status.replace('_', ' ')}</span>`;
    }

    return `
        <tr>
            <td><strong>#${order.id}</strong></td>
            <td>${order.client_name}</td>
            <td>${order.client_phone}</td>
            <td>${order.total_items} items (${priceText})</td>
            <td style="font-size:0.8rem; color:var(--text-secondary);">${dateString}</td>
            <td>${statusSelector}</td>
            <td>
                <div style="display:flex; gap:0.5rem;">
                    <button class="action-icon-btn edit" onclick="viewOrderDetails('${order.id}')" title="Ver Detalles">
                        <i data-lucide="eye" style="width:18px; height:18px;"></i>
                    </button>
                    <button class="action-icon-btn delete" onclick="deleteOrder('${order.id}')" title="Eliminar Pedido">
                        <i data-lucide="trash-2" style="width:18px; height:18px;"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Actualizar estado de un pedido (Invocado desde onchange en la tabla)
async function updateOrderStatus(orderId, newStatus) {
    try {
        if (newStatus === 'completado') {
            openPaymentModal(orderId, newStatus);
            return;
        }

        const response = await fetch('/api/orders', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: orderId, status: newStatus, paymentMethod: null })
        });

        if (!response.ok) throw new Error('Error al actualizar estado');
        
        showToast(`Pedido #${orderId} actualizado a "${newStatus.replace('_', ' ')}"`, 'success');
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar el estado del pedido.', 'error');
    }
}

// Eliminar un pedido
async function deleteOrder(orderId) {
    if (!confirm(`¿Estás completamente seguro de eliminar el pedido #${orderId}? Esta acción borrará todos sus detalles permanentemente.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/orders?id=${orderId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Error al eliminar');

        showToast(`Pedido #${orderId} eliminado con éxito del sistema.`, 'info');
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al eliminar el pedido.', 'error');
    }
}

// Ver detalles del pedido en Modal
async function viewOrderDetails(orderId) {
    try {
        const res = await fetch(`/api/orders?id=${orderId}`);
        if (!res.ok) throw new Error('Error al obtener detalles');
        const order = await res.json();

        // Rellenar modal
        document.getElementById('modal-order-title').textContent = `Detalles del Pedido #${order.id}`;
        document.getElementById('modal-client-name').textContent = order.client_name;
        document.getElementById('modal-client-phone').textContent = order.client_phone;
        
        const dateObj = new Date(order.created_at);
        document.getElementById('modal-order-date').textContent = dateObj.toLocaleString('es-VE');

        // Badge de estado
        const statusBadge = document.getElementById('modal-order-status');
        statusBadge.className = `status-badge ${order.status}`;
        statusBadge.textContent = order.status.replace('_', ' ');

        // Total del Pedido
        const totalText = order.total_price > 0 ? `$${parseFloat(order.total_price).toFixed(2)}` : 'Cotización';
        const totalElement = document.getElementById('modal-order-total');
        if (totalElement) {
            totalElement.textContent = totalText;
        }

        // Items del pedido
        const itemsList = document.getElementById('modal-items-list');
        if (itemsList) {
            if (!order.items || order.items.length === 0) {
                itemsList.innerHTML = `<p style="color:var(--text-secondary); text-align:center;">No hay detalles de productos registrados.</p>`;
            } else {
                itemsList.innerHTML = order.items.map(item => {
                    const sizeText = item.size ? (item.size.includes(':') ? ` [${item.size}]` : ` [Talla: ${item.size}]`) : '';
                    // Mapear icono
                    const iconMap = { shirt: 'shirt', coffee: 'coffee', crown: 'crown', scissors: 'scissors', 'circle-dot': 'circle-dot', link: 'link' };
                    const iconName = iconMap[item.product_id] || 'package';

                    // Buscar precio en productsList para calcular subtotal
                    const product = productsList.find(p => p.id === item.product_id);
                    const hasPrice = product && parseFloat(product.price) > 0;
                    const priceText = hasPrice ? `$${parseFloat(product.price).toFixed(2)}` : 'Cotización';
                    const subtotalText = hasPrice ? `$${(parseFloat(product.price) * item.quantity).toFixed(2)}` : 'Cotización';

                    return `
                        <div class="detail-item" style="align-items: center;">
                            <div class="detail-item-info">
                                <div class="detail-item-icon">
                                    <i data-lucide="${iconName}"></i>
                                </div>
                                <div class="detail-item-name">
                                    <h4>${item.product_name}</h4>
                                    <span>ID: ${item.product_id}${sizeText}</span>
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; flex-direction: column; gap: 0.2rem; font-family: 'Outfit', sans-serif;">
                                <div class="detail-item-qty" style="font-size: 1.05rem; font-weight: 600; color: var(--primary);">
                                    x${item.quantity}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                                    Precio: ${priceText}
                                </div>
                                <div style="font-size: 0.8rem; font-weight: 500; color: var(--success);">
                                    Subtotal: ${subtotalText}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Configurar botón de chatear
        const btnChat = document.getElementById('btn-modal-chat');
        if (btnChat) {
            // Limpiar teléfono por seguridad de URL
            const cleanPhone = order.client_phone.replace(/[^\d]/g, '');
            const message = `Hola ${order.client_name}, te contacto de *ÉLARA* con respecto a tu pedido *#${order.id}*...`;
            btnChat.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        }

        // Abrir modal
        orderModal.classList.add('active');
        lucide.createIcons();
    } catch (err) {
        console.error(err);
        showToast('Error al obtener los detalles del pedido.', 'error');
    }
}

// Cerrar Modal
function closeModal() {
    orderModal.classList.remove('active');
}
if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
if (btnCloseModalFooter) btnCloseModalFooter.addEventListener('click', closeModal);
if (orderModal) {
    orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) closeModal();
    });
}

// --- LÓGICA DEL MODAL DE PAGO ---
function openPaymentModal(orderId, newStatus) {
    pendingPaymentOrderId = orderId;
    pendingPaymentStatus = newStatus;
    if (paymentModalOrderId) {
        paymentModalOrderId.textContent = `#${orderId}`;
    }
    
    // Resetear opciones a valores iniciales
    if (paymentMethodSelect) {
        paymentMethodSelect.value = "Pago Móvil";
    }
    if (paymentReferenceInput) {
        paymentReferenceInput.value = "";
    }
    toggleReferenceField();
    
    if (paymentModal) {
        paymentModal.classList.add('active');
    }
    lucide.createIcons();
}

function toggleReferenceField() {
    if (!paymentMethodSelect) return;
    const method = paymentMethodSelect.value;
    if (method === "Pago Móvil" || method === "Transferencia") {
        if (referenceGroup) referenceGroup.style.display = "block";
        if (paymentReferenceInput) {
            paymentReferenceInput.required = true;
            paymentReferenceInput.setAttribute("required", "");
        }
    } else {
        if (referenceGroup) referenceGroup.style.display = "none";
        if (paymentReferenceInput) {
            paymentReferenceInput.required = false;
            paymentReferenceInput.removeAttribute("required");
            paymentReferenceInput.value = "";
        }
    }
}

function closePaymentModal() {
    if (paymentModal) {
        paymentModal.classList.remove('active');
    }
    pendingPaymentOrderId = null;
    pendingPaymentStatus = null;
    refreshAllData(); // Revierte el valor seleccionado en las tablas/dropdowns al valor actual en DB
}

if (paymentMethodSelect) {
    paymentMethodSelect.addEventListener('change', toggleReferenceField);
}

if (btnClosePaymentModal) btnClosePaymentModal.addEventListener('click', closePaymentModal);
if (btnCancelPaymentModal) btnCancelPaymentModal.addEventListener('click', closePaymentModal);
if (paymentModal) {
    paymentModal.addEventListener('click', (e) => {
        if (e.target === paymentModal) closePaymentModal();
    });
}

if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const method = paymentMethodSelect ? paymentMethodSelect.value : "Pago Móvil";
        let paymentMethodString = method;
        
        if (method === "Pago Móvil" || method === "Transferencia") {
            const ref = paymentReferenceInput ? paymentReferenceInput.value.trim() : "";
            if (!/^\d{4}$/.test(ref)) {
                showToast("La referencia debe ser de exactamente 4 dígitos numéricos.", "warning");
                return;
            }
            paymentMethodString = `${method} - Ref: ${ref}`;
        }
        
        const orderId = pendingPaymentOrderId;
        const status = pendingPaymentStatus;
        
        // Loader en el botón de confirmar
        const btnConfirm = document.getElementById('btn-confirm-payment');
        const originalHTML = btnConfirm ? btnConfirm.innerHTML : '';
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<i data-lucide="loader" class="spin"></i> Procesando...';
            lucide.createIcons();
        }
        
        try {
            const response = await fetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId, status: status, paymentMethod: paymentMethodString })
            });

            if (!response.ok) throw new Error('Error al actualizar estado');
            
            showToast(`Pedido #${orderId} completado y pago registrado con éxito.`, 'success');
            
            // Cerrar el modal limpiando variables de estado
            if (paymentModal) {
                paymentModal.classList.remove('active');
            }
            pendingPaymentOrderId = null;
            pendingPaymentStatus = null;
            
            await refreshAllData();
        } catch (err) {
            console.error(err);
            showToast('Error al registrar el pago del pedido.', 'error');
        } finally {
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = originalHTML;
                lucide.createIcons();
            }
        }
    });
}

// --- GESTIÓN DE PRODUCTOS (CRUD INVENTARIO) ---

function renderProductsTable() {
    const tableProducts = document.getElementById('table-products');
    if (!tableProducts) return;

    if (productsList.length === 0) {
        tableProducts.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">No hay productos en el catálogo. Crea uno nuevo.</td></tr>`;
        return;
    }

    tableProducts.innerHTML = productsList.map(p => {
        const sizesText = p.sizes || 'N/A';
        const priceText = p.price > 0 ? `$${p.price.toFixed(2)}` : 'WhatsApp';
        const statusText = p.active === 1 ? 'Activo' : 'Oculto';
        const statusClass = p.active === 1 ? 'completado' : 'cancelado';

        return `
            <tr>
                <td>
                    <img src="${p.image_url}" alt="${p.name}" style="width:44px; height:44px; object-fit:cover; border-radius:8px; border:1px solid var(--border-color);">
                </td>
                <td><code>${p.id}</code></td>
                <td><strong>${p.name}</strong></td>
                <td><span style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.25rem 0.5rem; border-radius:6px;">${p.category || 'general'}</span></td>
                <td>${priceText}</td>
                <td style="font-size:0.85rem; color:var(--text-secondary);">${sizesText}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="action-icon-btn edit" onclick="startEditProduct('${p.id}')" title="Editar Producto">
                            <i data-lucide="edit-3" style="width:18px; height:18px;"></i>
                        </button>
                        <button class="action-icon-btn delete" onclick="deleteProduct('${p.id}')" title="Eliminar Producto">
                            <i data-lucide="trash-2" style="width:18px; height:18px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    lucide.createIcons();
}

// Enviar formulario (Crear / Editar Producto)
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const method = document.getElementById('prod-method').value;
        const id = document.getElementById('prod-id').value.trim();
        const name = document.getElementById('prod-name').value.trim();
        const category = document.getElementById('prod-category').value.trim();
        const price = parseFloat(document.getElementById('prod-price').value) || 0.0;
        const icon = document.getElementById('prod-icon').value.trim();
        const image_url = document.getElementById('prod-image').value.trim();
        const sizes = document.getElementById('prod-sizes').value.trim();
        const active = parseInt(document.getElementById('prod-active').value);

        const btnSave = document.getElementById('btn-submit-product');
        btnSave.disabled = true;
        btnSave.innerHTML = '<i data-lucide="loader" class="spin"></i> Guardando...';
        lucide.createIcons();

        try {
            const response = await fetch('/api/products', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id, name, category, price, icon, image_url, sizes: sizes || null, active
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(data.message || 'Producto guardado.', 'success');
                resetProductForm();
                refreshAllData();
            } else {
                showToast(data.error || 'Error al guardar el producto.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de red al guardar producto.', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i data-lucide="plus-circle"></i> Guardar Producto';
            lucide.createIcons();
        }
    });
}

// Iniciar edición de un producto
function startEditProduct(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    // Rellenar campos del formulario
    document.getElementById('prod-method').value = 'PUT';
    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-id').disabled = true; // El slug/ID no se puede cambiar
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-category').value = product.category || '';
    document.getElementById('prod-price').value = product.price;
    document.getElementById('prod-icon').value = product.icon || '';
    document.getElementById('prod-image').value = product.image_url;
    document.getElementById('prod-sizes').value = product.sizes || '';
    document.getElementById('prod-active').value = product.active;

    // Cambiar estética de edición
    formProductTitle.textContent = `Editando Producto: ${product.name}`;
    btnSubmitProduct.innerHTML = '<i data-lucide="save"></i> Actualizar Producto';
    btnCancelEdit.style.display = 'inline-flex';
    
    lucide.createIcons();

    // Expandir formulario si está colapsado al querer editar
    const collapseEl = document.getElementById('product-form-collapse');
    const collapseIcon = document.getElementById('product-form-icon');
    if (collapseEl && !collapseEl.classList.contains('expanded')) {
        collapseEl.classList.add('expanded');
        if (collapseIcon) collapseIcon.style.transform = 'rotate(180deg)';
    }

    // Hacer scroll suave hacia el título del formulario (Editando Producto)
    if (formProductTitle) {
        formProductTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Cancelar Edición
function resetProductForm() {
    productForm.reset();
    document.getElementById('prod-method').value = 'POST';
    document.getElementById('prod-id').disabled = false;
    formProductTitle.textContent = 'Registrar Nuevo Producto';
    btnSubmitProduct.innerHTML = '<i data-lucide="plus-circle"></i> Guardar Producto';
    btnCancelEdit.style.display = 'none';
    lucide.createIcons();

    // Colapsar formulario de nuevo
    const collapseEl = document.getElementById('product-form-collapse');
    const collapseIcon = document.getElementById('product-form-icon');
    if (collapseEl && collapseEl.classList.contains('expanded')) {
        collapseEl.classList.remove('expanded');
        if (collapseIcon) collapseIcon.style.transform = 'rotate(0deg)';
    }
}

if (btnCancelEdit) btnCancelEdit.addEventListener('click', resetProductForm);

// Eliminar un producto
async function deleteProduct(productId) {
    if (!confirm(`¿Estás completamente seguro de eliminar "${productId}" del catálogo? Se borrará permanentemente de la base de datos.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/products?id=${productId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Error al eliminar');

        showToast('Producto eliminado permanentemente del catálogo.', 'info');
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al intentar eliminar el producto.', 'error');
    }
}

// --- BOTONES DE ACTUALIZACIÓN EN VIVO ---
const btnRefreshOrders = document.getElementById('btn-refresh-orders');
if (btnRefreshOrders) {
    btnRefreshOrders.addEventListener('click', () => {
        btnRefreshOrders.classList.add('spin');
        loadOrders().then(() => {
            showToast('Lista de pedidos sincronizada.', 'success');
            btnRefreshOrders.classList.remove('spin');
        });
    });
}

const btnRefreshProducts = document.getElementById('btn-refresh-products');
if (btnRefreshProducts) {
    btnRefreshProducts.addEventListener('click', () => {
        btnRefreshProducts.classList.add('spin');
        loadProducts().then(() => {
            showToast('Catálogo sincronizado.', 'success');
            btnRefreshProducts.classList.remove('spin');
        });
    });
}

const btnRefreshSales = document.getElementById('btn-refresh-sales');
if (btnRefreshSales) {
    btnRefreshSales.addEventListener('click', () => {
        btnRefreshSales.classList.add('spin');
        loadSales().then(() => {
            showToast('Registro de ventas sincronizado.', 'success');
            btnRefreshSales.classList.remove('spin');
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    checkSession();
    
    // Inicializar lógica de colapsado de formulario de productos
    const productFormHeader = document.getElementById('product-form-header');
    const productFormCollapse = document.getElementById('product-form-collapse');
    const productFormIcon = document.getElementById('product-form-icon');
    
    if (productFormHeader && productFormCollapse) {
        productFormHeader.addEventListener('click', () => {
            const isExpanded = productFormCollapse.classList.toggle('expanded');
            if (productFormIcon) {
                productFormIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    }
    
    // Inicializar lógica de Sidebar colapsable en móvil y tablet
    const sidebar = document.querySelector('.sidebar');
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (btnSidebarToggle && sidebar && sidebarOverlay) {
        btnSidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });
        
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
        
        // Cerrar sidebar automáticamente al navegar a otra sección en pantallas móviles
        const sidebarMenuLinks = document.querySelectorAll('.sidebar-link');
        sidebarMenuLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 992) {
                    sidebar.classList.remove('active');
                    sidebarOverlay.classList.remove('active');
                }
            });
        });
    }
});

// Exponer funciones globales para controladores onclick en HTML
window.updateOrderStatus = updateOrderStatus;
window.deleteOrder = deleteOrder;
window.viewOrderDetails = viewOrderDetails;
window.startEditProduct = startEditProduct;
window.deleteProduct = deleteProduct;
