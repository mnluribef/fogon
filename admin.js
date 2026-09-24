// Lógica del Panel Administrativo - FOGÓN Restaurante

// Variables de estado
let currentAdmin = null;
let ordersList = [];
let productsList = [];
let salesList = [];
let currentBcvRate = 853.50;
let currentBcvAuto = true;

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
const btnToggleProductForm = document.getElementById('btn-toggle-product-form');

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

// Modal Cambiar Contraseña
const changePasswordModal = document.getElementById('change-password-modal');
const btnOpenChangePassword = document.getElementById('btn-open-change-password');
const btnClosePasswordModal = document.getElementById('btn-close-password-modal');
const btnCancelPasswordModal = document.getElementById('btn-cancel-password-modal');
const changePasswordForm = document.getElementById('change-password-form');

let pendingPaymentOrderId = null;
let pendingPaymentStatus = null;

// --- UTILIDAD DE SANITIZACIÓN CONTRA STORED XSS ---
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
 * Muestra una notificación flotante segura
 * @param {string} message 
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
function showToast(message, type = 'success') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';
    if (type === 'warning') icon = 'alert-circle';
    if (type === 'info') icon = 'info';

    const span = document.createElement('span');
    span.textContent = message;

    toast.innerHTML = `<i data-lucide="${icon}"></i>`;
    toast.appendChild(span);

    toastContainer.appendChild(toast);
    if (window.lucide) lucide.createIcons();

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
        if (window.lucide) lucide.createIcons();

        try {
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
            showToast('Error de red al intentar iniciar sesión', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Iniciar Sesión <i data-lucide="arrow-right"></i>';
            if (window.lucide) lucide.createIcons();
        }
    });
}

// Logout
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await fetch('/api/auth', { method: 'DELETE' });
            currentAdmin = null;
            showToast('Sesión cerrada correctamente.', 'info');
            setTimeout(() => {
                window.location.href = '/login';
            }, 600);
        } catch (err) {
            console.error("Error en logout:", err);
            window.location.href = '/login';
        }
    });
}

// --- CAMBIAR CONTRASEÑA ---
if (btnOpenChangePassword && changePasswordModal) {
    btnOpenChangePassword.addEventListener('click', () => {
        changePasswordModal.classList.add('active');
        if (changePasswordForm) changePasswordForm.reset();
        document.getElementById('current-password-input')?.focus();
    });
}

function closePasswordModal() {
    if (changePasswordModal) changePasswordModal.classList.remove('active');
}
if (btnClosePasswordModal) btnClosePasswordModal.addEventListener('click', closePasswordModal);
if (btnCancelPasswordModal) btnCancelPasswordModal.addEventListener('click', closePasswordModal);
if (changePasswordModal) {
    changePasswordModal.addEventListener('click', (e) => {
        if (e.target === changePasswordModal) closePasswordModal();
    });
}

if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPass = document.getElementById('current-password-input')?.value;
        const newPass = document.getElementById('new-password-input')?.value;
        const confirmPass = document.getElementById('confirm-password-input')?.value;
        const submitBtn = document.getElementById('btn-submit-password');

        if (!currentPass || !newPass || !confirmPass) {
            showToast('Por favor completa todos los campos.', 'warning');
            return;
        }

        if (newPass.length < 8) {
            showToast('La nueva clave debe tener al menos 8 caracteres.', 'warning');
            return;
        }

        if (newPass !== confirmPass) {
            showToast('La nueva contraseña y su confirmación no coinciden.', 'warning');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Actualizando...';
        if (window.lucide) lucide.createIcons();

        try {
            const currentPasswordHash = await sha256(currentPass);
            const newPasswordHash = await sha256(newPass);

            const res = await fetch('/api/auth', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPasswordHash, newPasswordHash })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                showToast('¡Contraseña cambiada exitosamente!', 'success');
                closePasswordModal();
                changePasswordForm.reset();
            } else {
                showToast(data.error || 'Error al cambiar la contraseña.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de red al actualizar contraseña.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i data-lucide="save"></i> Actualizar Clave';
            if (window.lucide) lucide.createIcons();
        }
    });
}

// --- NAVEGACIÓN ENTRE SECCIONES DEL SIDEBAR ---
sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
        sidebarLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const targetId = link.getAttribute('data-target');
        sections.forEach(sec => {
            sec.classList.remove('active');
            if (sec.id === targetId) sec.classList.add('active');
        });

        // Actualizar encabezados
        if (targetId === 'section-metrics') {
            if (dashboardTitle) dashboardTitle.textContent = 'Métricas Generales';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Visión global de rendimiento, pedidos y catálogo en FOGÓN.';
        } else if (targetId === 'section-orders') {
            if (dashboardTitle) dashboardTitle.textContent = 'Gestión de Pedidos';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Revisa y actualiza el estado de los pedidos recibidos por la web.';
        } else if (targetId === 'section-sales') {
            if (dashboardTitle) dashboardTitle.textContent = 'Registro de Ventas';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Histórico de pedidos completados y cobrados exitosamente.';
        } else if (targetId === 'section-inventory') {
            if (dashboardTitle) dashboardTitle.textContent = 'Gestión del Menú';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Agrega, edita precios y administra los platillos ofrecidos.';
        }
    });
});

document.querySelectorAll('.view-all-orders-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const ordersTab = document.querySelector('.sidebar-link[data-target="section-orders"]');
        if (ordersTab) ordersTab.click();
    });
});

// --- CARGA Y RENDERIZACIÓN DE DATOS ---


// Cargar Tasa Oficial BCV
async function loadBcvRate() {
    try {
        const res = await fetch('/api/bcv');
        if (res.ok) {
            const data = await res.json();
            currentBcvRate = parseFloat(data.rate) || 853.50;
            currentBcvAuto = data.autoUpdate !== false;
            const display = document.getElementById('admin-bcv-val');
            if (display) display.textContent = `${currentBcvRate.toFixed(2)} Bs.`;
            
            const input = document.getElementById('bcv-rate-input');
            const toggle = document.getElementById('bcv-auto-toggle');
            const syncText = document.getElementById('bcv-last-sync-text');
            if (input) input.value = currentBcvRate.toFixed(2);
            if (toggle) toggle.checked = currentBcvAuto;
            if (syncText) {
                syncText.textContent = data.updatedAt ? `Última actualización: ${data.updatedAt}` : `Fuente: ${data.source || 'BCV'}`;
            }
        }
    } catch (e) {
        console.error("Error al consultar tasa BCV:", e);
    }
}

async function refreshAllData() {
    await Promise.all([
        loadBcvRate(),
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
        showToast('Error al cargar menú del servidor.', 'error');
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
                <td><strong>#V-${escapeHtml(s.id)}</strong></td>
                <td><code style="font-weight: 700; color: var(--primary);">${escapeHtml(s.order_id)}</code></td>
                <td>${escapeHtml(s.client_name)}</td>
                <td>${escapeHtml(s.client_phone)}</td>
                <td style="font-weight: 700; color: var(--success);">$${montoVal.toFixed(2)}</td>
                <td><span style="background: rgba(34, 197, 94, 0.1); color: var(--success); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">${escapeHtml(s.metodo_pago)}</span></td>
                <td style="font-size: 0.85rem; color: var(--text-secondary);">${dateString}</td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// --- RENDER DE MÉTRICAS ---
function renderMetrics() {
    const metricProdCount = document.getElementById('metric-prod-count');
    if (metricProdCount) metricProdCount.textContent = productsList.length;

    const pendingOrders = ordersList.filter(o => o.status === 'pendiente');
    const prodOrders = ordersList.filter(o => o.status === 'en_produccion');
    
    const metricPending = document.getElementById('metric-pending-orders');
    if (metricPending) metricPending.textContent = pendingOrders.length;

    const metricProd = document.getElementById('metric-prod-orders');
    if (metricProd) metricProd.textContent = prodOrders.length;

    const completedOrders = ordersList.filter(o => o.status === 'completado');
    const metricSalesCount = document.getElementById('metric-sales-count');
    
    if (metricSalesCount) {
        const totalSalesSum = completedOrders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
        metricSalesCount.textContent = `$${totalSalesSum.toFixed(2)}`;
    }
}

// --- CONTROL Y RENDER DE PEDIDOS ---

function renderOrders() {
    const tableAll = document.getElementById('table-all-orders');
    const tableRecent = document.getElementById('table-recent-orders');

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

    if (window.lucide) lucide.createIcons();
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

    const priceText = order.total_price > 0 ? `$${parseFloat(order.total_price).toFixed(2)}` : '$0.00';
    
    let statusSelector = '';
    if (includeStatusSelector) {
        statusSelector = `
            <select class="status-select" onchange="updateOrderStatus('${escapeHtml(order.id)}', this.value)">
                <option value="pendiente" ${order.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="en_produccion" ${order.status === 'en_produccion' ? 'selected' : ''}>En Preparación</option>
                <option value="listo_entrega" ${order.status === 'listo_entrega' ? 'selected' : ''}>Listo para Entrega</option>
                <option value="completado" ${order.status === 'completado' ? 'selected' : ''}>Completado</option>
                <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
        `;
    } else {
        statusSelector = `<span class="status-badge ${escapeHtml(order.status)}">${escapeHtml(order.status).replace('_', ' ')}</span>`;
    }

        const hasReceipt = Boolean(order.payment_receipt);
        const receiptBadge = hasReceipt ? ' <span title="Comprobante de pago adjunto" style="cursor:help;">📸</span>' : '';
        return `
        <tr>
            <td><strong>#${escapeHtml(order.id)}</strong>${receiptBadge}</td>
            <td>${escapeHtml(order.client_name)}</td>
            <td>${escapeHtml(order.client_phone)}</td>
            <td>${escapeHtml(order.total_items)} items (${priceText})</td>
            <td style="font-size:0.8rem; color:var(--text-secondary);">${dateString}</td>
            <td>${statusSelector}</td>
            <td>
                <div style="display:flex; gap:0.5rem;">
                    <button class="action-icon-btn edit" onclick="viewOrderDetails('${escapeHtml(order.id)}')" title="Ver Detalles">
                        <i data-lucide="eye" style="width:18px; height:18px;"></i>
                    </button>
                    <button class="action-icon-btn delete" onclick="deleteOrder('${escapeHtml(order.id)}')" title="Eliminar Pedido">
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
        const response = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`, {
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

// Ver detalles del pedido en Modal (Sanitizado contra XSS)
async function viewOrderDetails(orderId) {
    try {
        const res = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`);
        if (!res.ok) throw new Error('Error al obtener detalles');
        const order = await res.json();

        // Rellenar modal mediante textContent para seguridad total
        const titleElem = document.getElementById('modal-order-title');
        if (titleElem) titleElem.textContent = `Detalles del Pedido #${order.id}`;

        const clientNameElem = document.getElementById('modal-client-name');
        if (clientNameElem) clientNameElem.textContent = order.client_name;

        const clientPhoneElem = document.getElementById('modal-client-phone');
        if (clientPhoneElem) clientPhoneElem.textContent = order.client_phone;
        
        const dateObj = new Date(order.created_at);
        const orderDateElem = document.getElementById('modal-order-date');
        if (orderDateElem) orderDateElem.textContent = dateObj.toLocaleString('es-VE');

        // Badge de estado
        const statusBadge = document.getElementById('modal-order-status');
        if (statusBadge) {
            statusBadge.className = `status-badge ${order.status}`;
            statusBadge.textContent = (order.status || '').replace('_', ' ');
        }

        // Total del Pedido
        const totalVal = parseFloat(order.total_price) || 0.0;
        const totalText = totalVal > 0 ? `${totalVal.toFixed(2)}` : '$0.00';
        const totalElement = document.getElementById('modal-order-total');
        if (totalElement) {
            totalElement.textContent = totalText;
        }

        const bcvRateUsed = parseFloat(order.bcv_rate) || currentBcvRate;
        const totalBsVal = parseFloat(order.total_bs) || (totalVal * bcvRateUsed);
        const totalBsElement = document.getElementById('modal-order-total-bs');
        if (totalBsElement) {
            totalBsElement.textContent = `≈ Bs. ${totalBsVal.toFixed(2)} (Tasa: ${bcvRateUsed.toFixed(2)} Bs/$)`;
        }

        // Comprobante de Pago Adjunto
        const receiptContainer = document.getElementById('modal-receipt-container');
        const receiptThumb = document.getElementById('modal-receipt-thumb');
        const receiptDownloadBtn = document.getElementById('receipt-download-btn');
        const receiptModalImg = document.getElementById('receipt-modal-img');

        if (order.payment_receipt) {
            if (receiptContainer) receiptContainer.style.display = 'block';
            if (receiptThumb) receiptThumb.src = order.payment_receipt;
            if (receiptDownloadBtn) receiptDownloadBtn.href = order.payment_receipt;
            if (receiptModalImg) receiptModalImg.src = order.payment_receipt;
        } else {
            if (receiptContainer) receiptContainer.style.display = 'none';
        }

        // Información de Delivery
        const deliveryTypeElem = document.getElementById('modal-delivery-type');
        const deliveryAddressContainer = document.getElementById('modal-delivery-address-container');
        const deliveryAddressElem = document.getElementById('modal-delivery-address');
        const deliveryNotesContainer = document.getElementById('modal-delivery-notes-container');
        const deliveryNotesElem = document.getElementById('modal-delivery-notes');

        if (deliveryTypeElem) {
            const isDelivery = order.delivery_type === 'delivery';
            deliveryTypeElem.textContent = isDelivery ? '🛵 Delivery a Domicilio' : '🏪 Retiro en Local';
            
            if (isDelivery) {
                if (deliveryAddressContainer) deliveryAddressContainer.style.display = 'block';
                if (deliveryAddressElem) deliveryAddressElem.textContent = order.delivery_address || 'No especificada';
                
                if (order.delivery_notes) {
                    if (deliveryNotesContainer) deliveryNotesContainer.style.display = 'block';
                    if (deliveryNotesElem) deliveryNotesElem.textContent = order.delivery_notes;
                } else {
                    if (deliveryNotesContainer) deliveryNotesContainer.style.display = 'none';
                }
            } else {
                if (deliveryAddressContainer) deliveryAddressContainer.style.display = 'none';
                if (deliveryNotesContainer) deliveryNotesContainer.style.display = 'none';
            }
        }

        // Información de Pago
        const paymentMethodElem = document.getElementById('modal-payment-method');
        const paymentRefElem = document.getElementById('modal-payment-reference');
        const paymentLabels = {
            pago_movil: '📱 Pago Móvil',
            zelle: '🇺🇸 Zelle',
            efectivo: '💵 Efectivo',
            punto: '💳 Punto de Venta'
        };

        if (paymentMethodElem) {
            paymentMethodElem.textContent = paymentLabels[order.payment_method] || order.payment_method || 'Por acordar';
        }
        if (paymentRefElem) {
            paymentRefElem.textContent = order.payment_reference || 'Sin referencia registrada';
        }

        // Items del pedido usando unit_price real guardado en DB
        const itemsList = document.getElementById('modal-items-list');
        if (itemsList) {
            if (!order.items || order.items.length === 0) {
                itemsList.innerHTML = `<p style="color:var(--text-secondary); text-align:center;">No hay detalles de productos registrados.</p>`;
            } else {
                itemsList.innerHTML = order.items.map(item => {
                    const sizeText = item.size ? ` [${escapeHtml(item.size)}]` : '';
                    const unitPrice = parseFloat(item.unit_price) || 0.0;
                    const subtotal = unitPrice * item.quantity;

                    return `
                        <div class="detail-item" style="align-items: center;">
                            <div class="detail-item-info">
                                <div class="detail-item-icon">
                                    <i data-lucide="utensils"></i>
                                </div>
                                <div class="detail-item-name">
                                    <h4>${escapeHtml(item.product_name)}</h4>
                                    <span>ID: ${escapeHtml(item.product_id)}${sizeText}</span>
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; flex-direction: column; gap: 0.2rem; font-family: 'Outfit', sans-serif;">
                                <div class="detail-item-qty" style="font-size: 1.05rem; font-weight: 600; color: var(--primary);">
                                    x${item.quantity}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                                    Precio: $${unitPrice.toFixed(2)}
                                </div>
                                <div style="font-size: 0.8rem; font-weight: 500; color: var(--success);">
                                    Subtotal: $${subtotal.toFixed(2)}
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
            const cleanPhone = String(order.client_phone || '').replace(/[^\d]/g, '');
            const message = `¡Hola ${order.client_name}! Te contactamos de *FOGÓN Restaurante* con respecto a tu pedido *#${order.id}*...`;
            btnChat.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        }

        orderModal.classList.add('active');
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error(err);
        showToast('Error al obtener los detalles del pedido.', 'error');
    }
}

// Cerrar Modal
function closeModal() {
    if (orderModal) orderModal.classList.remove('active');
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
    
    const targetOrder = ordersList.find(o => o.id === orderId);
    const amountInput = document.getElementById('payment-amount');
    if (amountInput && targetOrder) {
        amountInput.value = parseFloat(targetOrder.total_price || 0).toFixed(2);
    }

    if (paymentMethodSelect && targetOrder?.payment_method) {
        paymentMethodSelect.value = targetOrder.payment_method;
    }
    if (paymentReferenceInput) {
        paymentReferenceInput.value = targetOrder?.payment_reference || '';
    }
    
    if (paymentModal) {
        paymentModal.classList.add('active');
    }
    if (window.lucide) lucide.createIcons();
}

function closePaymentModal() {
    if (paymentModal) {
        paymentModal.classList.remove('active');
    }
    pendingPaymentOrderId = null;
    pendingPaymentStatus = null;
    refreshAllData();
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
        
        const method = paymentMethodSelect ? paymentMethodSelect.value : "pago_movil";
        const ref = paymentReferenceInput ? paymentReferenceInput.value.trim() : "";
        const paymentMethodString = ref ? `${method} (Ref: ${ref})` : method;
        
        const orderId = pendingPaymentOrderId;
        const status = pendingPaymentStatus;
        
        const btnConfirm = document.getElementById('btn-confirm-payment');
        const originalHTML = btnConfirm ? btnConfirm.innerHTML : '';
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<i data-lucide="loader" class="spin"></i> Procesando...';
            if (window.lucide) lucide.createIcons();
        }
        
        try {
            const response = await fetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId, status: status, paymentMethod: paymentMethodString })
            });

            if (!response.ok) throw new Error('Error al actualizar estado');
            
            showToast(`Pedido #${orderId} completado y venta registrada.`, 'success');
            
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
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// --- GESTIÓN DE PRODUCTOS (CRUD INVENTARIO / MENÚ) ---

function renderProductsTable() {
    const tableProducts = document.getElementById('table-products');
    if (!tableProducts) return;

    if (productsList.length === 0) {
        tableProducts.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">No hay platos en el menú. Agrega uno nuevo.</td></tr>`;
        return;
    }

    tableProducts.innerHTML = productsList.map(p => {
        const sizesText = p.sizes || 'N/A';
        const priceText = p.price > 0 ? `$${parseFloat(p.price).toFixed(2)}` : '$0.00';
        const statusText = p.active === 1 ? 'Disponible' : 'Agotado';
        const statusClass = p.active === 1 ? 'completado' : 'cancelado';
        const categoryLabel = p.category || p.type_id || 'general';

        return `
            <tr>
                <td>
                    <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="width:44px; height:44px; object-fit:cover; border-radius:8px; border:1px solid var(--border-color);">
                </td>
                <td><code>${escapeHtml(p.id)}</code></td>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td><span style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.25rem 0.5rem; border-radius:6px;">${escapeHtml(categoryLabel)}</span></td>
                <td>${priceText}</td>
                <td style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(sizesText)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="action-icon-btn edit" onclick="startEditProduct('${escapeHtml(p.id)}')" title="Editar Plato">
                            <i data-lucide="edit-3" style="width:18px; height:18px;"></i>
                        </button>
                        <button class="action-icon-btn delete" onclick="deleteProduct('${escapeHtml(p.id)}')" title="Eliminar Plato">
                            <i data-lucide="trash-2" style="width:18px; height:18px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// Enviar formulario (Crear / Editar Producto)
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const method = document.getElementById('prod-method')?.value || 'POST';
        const id = document.getElementById('prod-id')?.value.trim();
        const name = document.getElementById('prod-name')?.value.trim();
        const category = document.getElementById('prod-category')?.value.trim();
        const price = parseFloat(document.getElementById('prod-price')?.value) || 0.0;
        const icon = document.getElementById('prod-icon')?.value.trim();
        const image_url = document.getElementById('prod-image')?.value.trim();
        const sizes = document.getElementById('prod-sizes')?.value.trim();
        const active = parseInt(document.getElementById('prod-active')?.value) || 1;
        const description = document.getElementById('prod-description')?.value.trim();

        const btnSave = document.getElementById('btn-submit-product');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i data-lucide="loader" class="spin"></i> Guardando...';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const response = await fetch('/api/products', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id, name, category, price, icon, image_url, sizes: sizes || null, active, description
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(data.message || 'Platillo guardado exitosamente.', 'success');
                resetProductForm();
                refreshAllData();
            } else {
                showToast(data.error || 'Error al guardar el plato.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de red al guardar plato.', 'error');
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-lucide="plus-circle"></i> Guardar Plato';
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// Iniciar edición de un producto
function startEditProduct(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    const methodEl = document.getElementById('prod-method');
    const idEl = document.getElementById('prod-id');
    const nameEl = document.getElementById('prod-name');
    const categoryEl = document.getElementById('prod-category');
    const priceEl = document.getElementById('prod-price');
    const iconEl = document.getElementById('prod-icon');
    const imageEl = document.getElementById('prod-image');
    const sizesEl = document.getElementById('prod-sizes');
    const activeEl = document.getElementById('prod-active');
    const descEl = document.getElementById('prod-description');

    if (methodEl) methodEl.value = 'PUT';
    if (idEl) {
        idEl.value = product.id;
        idEl.disabled = true;
    }
    if (nameEl) nameEl.value = product.name;
    if (categoryEl) categoryEl.value = product.category || product.type_id || 'principales';
    if (priceEl) priceEl.value = product.price;
    if (iconEl) iconEl.value = product.icon || '';
    if (imageEl) imageEl.value = product.image_url;
    if (sizesEl) sizesEl.value = product.sizes || '';
    if (activeEl) activeEl.value = product.active !== undefined ? product.active : 1;
    if (descEl) descEl.value = product.description || '';

    if (formProductTitle) formProductTitle.textContent = `Editando Plato: ${product.name}`;
    if (btnSubmitProduct) btnSubmitProduct.innerHTML = '<i data-lucide="save"></i> Actualizar Plato';
    if (btnCancelEdit) btnCancelEdit.style.display = 'inline-flex';
    
    if (window.lucide) lucide.createIcons();

    const collapseEl = document.getElementById('product-form-collapse');
    if (collapseEl && !collapseEl.classList.contains('expanded')) {
        collapseEl.classList.add('expanded');
    }

    if (formProductTitle) {
        formProductTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Cancelar Edición
function resetProductForm() {
    if (productForm) productForm.reset();
    const methodEl = document.getElementById('prod-method');
    const idEl = document.getElementById('prod-id');
    if (methodEl) methodEl.value = 'POST';
    if (idEl) idEl.disabled = false;
    if (formProductTitle) formProductTitle.textContent = 'Añadir Nuevo Plato';
    if (btnSubmitProduct) btnSubmitProduct.innerHTML = '<i data-lucide="plus-circle"></i> Guardar Plato';
    if (btnCancelEdit) btnCancelEdit.style.display = 'none';
    if (window.lucide) lucide.createIcons();

    const collapseEl = document.getElementById('product-form-collapse');
    if (collapseEl && collapseEl.classList.contains('expanded')) {
        collapseEl.classList.remove('expanded');
    }
}

if (btnCancelEdit) btnCancelEdit.addEventListener('click', resetProductForm);

// Eliminar un producto
async function deleteProduct(productId) {
    if (!confirm(`¿Estás completamente seguro de eliminar "${productId}" del menú? Se borrará permanentemente de la base de datos.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Error al eliminar');

        showToast('Platillo eliminado del menú.', 'info');
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al intentar eliminar el platillo.', 'error');
    }
}

// Botón Nuevo Plato (Toggle formulario)
if (btnToggleProductForm) {
    btnToggleProductForm.addEventListener('click', () => {
        const collapseEl = document.getElementById('product-form-collapse');
        if (collapseEl) {
            collapseEl.classList.toggle('expanded');
            if (collapseEl.classList.contains('expanded')) {
                document.getElementById('prod-id')?.focus();
            }
        }
    });
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
            showToast('Menú sincronizado.', 'success');
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
    
    // Sidebar colapsable en móvil
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
window.checkSession = checkSession;

// --- GESTIÓN DE TASA BCV ---
const bcvModal = document.getElementById('bcv-modal');
const btnOpenBcvModal = document.getElementById('btn-open-bcv-modal');
const btnCloseBcvModal = document.getElementById('btn-close-bcv-modal');
const btnCancelBcv = document.getElementById('btn-cancel-bcv');
const bcvForm = document.getElementById('bcv-form');

function openBcvModal() {
    if (bcvModal) bcvModal.classList.add('active');
    const input = document.getElementById('bcv-rate-input');
    if (input) input.value = currentBcvRate.toFixed(2);
    const toggle = document.getElementById('bcv-auto-toggle');
    if (toggle) toggle.checked = currentBcvAuto;
}
function closeBcvModal() {
    if (bcvModal) bcvModal.classList.remove('active');
}

if (btnOpenBcvModal) btnOpenBcvModal.addEventListener('click', openBcvModal);
if (btnCloseBcvModal) btnCloseBcvModal.addEventListener('click', closeBcvModal);
if (btnCancelBcv) btnCancelBcv.addEventListener('click', closeBcvModal);
if (bcvModal) {
    bcvModal.addEventListener('click', (e) => {
        if (e.target === bcvModal) closeBcvModal();
    });
}

if (bcvForm) {
    bcvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rateInput = document.getElementById('bcv-rate-input');
        const autoToggle = document.getElementById('bcv-auto-toggle');
        const newRate = parseFloat(rateInput?.value);
        const autoUpdate = autoToggle ? autoToggle.checked : true;

        if (!newRate || newRate <= 0) {
            showToast('Por favor introduce una tasa válida.', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/bcv', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rate: newRate, autoUpdate })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast('✅ Tasa BCV actualizada correctamente.', 'success');
                currentBcvRate = newRate;
                currentBcvAuto = autoUpdate;
                const display = document.getElementById('admin-bcv-val');
                if (display) display.textContent = `${newRate.toFixed(2)} Bs.`;
                closeBcvModal();
            } else {
                showToast(data.error || 'Error al actualizar tasa BCV.', 'error');
            }
        } catch (err) {
            showToast('Error de conexión al guardar tasa.', 'error');
        }
    });
}

// --- GESTIÓN DE VISOR DE COMPROBANTES ---
const receiptModal = document.getElementById('receipt-modal');
const btnViewReceiptModal = document.getElementById('btn-view-receipt-modal');
const modalReceiptThumb = document.getElementById('modal-receipt-thumb');
const btnCloseReceiptModal = document.getElementById('btn-close-receipt-modal');
const btnCloseReceiptFooter = document.getElementById('btn-close-receipt-footer');

function openReceiptModal() {
    if (receiptModal) receiptModal.classList.add('active');
}
function closeReceiptModal() {
    if (receiptModal) receiptModal.classList.remove('active');
}

if (btnViewReceiptModal) btnViewReceiptModal.addEventListener('click', openReceiptModal);
if (modalReceiptThumb) modalReceiptThumb.addEventListener('click', openReceiptModal);
if (btnCloseReceiptModal) btnCloseReceiptModal.addEventListener('click', closeReceiptModal);
if (btnCloseReceiptFooter) btnCloseReceiptFooter.addEventListener('click', closeReceiptModal);
if (receiptModal) {
    receiptModal.addEventListener('click', (e) => {
        if (e.target === receiptModal) closeReceiptModal();
    });
}
