// Controlador de Pedidos y Ventas - FOGÓN Restaurante
import { verifySession, unauthorizedResponse } from "./_auth.js";

/**
 * Genera un ID de pedido único y legible (ej: FOG-X9F4E)
 */
function generateOrderId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `FOG-${ts}${rand}`;
}

/**
 * Asegura que existan las columnas de comprobante y tasa BCV en la tabla orders
 */
async function ensureOrderColumns(db) {
    try {
        await db.prepare("ALTER TABLE orders ADD COLUMN payment_receipt TEXT").run();
    } catch (e) {}
    try {
        await db.prepare("ALTER TABLE orders ADD COLUMN bcv_rate REAL DEFAULT 0.0").run();
    } catch (e) {}
    try {
        await db.prepare("ALTER TABLE orders ADD COLUMN total_bs REAL DEFAULT 0.0").run();
    } catch (e) {}
}

/**
 * GET /api/orders - Listar pedidos o ver detalle de un pedido (Admin Only)
 */
export async function onRequestGet(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.fogon;

    await ensureOrderColumns(db);
    
    const url = new URL(request.url);
    const orderId = url.searchParams.get("id");

    try {
        if (orderId) {
            // Obtener un pedido específico con sus detalles
            const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
            if (!order) {
                return new Response(JSON.stringify({ error: "Pedido no encontrado." }), {
                    status: 404,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const { results: items } = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(orderId).all();
            
            return new Response(JSON.stringify({ ...order, items }), {
                headers: { "Content-Type": "application/json" }
            });
        } else {
            // Listar todos los pedidos ordenados por fecha
            const { results: orders } = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
            
            return new Response(JSON.stringify(orders), {
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (err) {
        console.error("Error en GET /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error interno al consultar pedidos." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * POST /api/orders - Crear un nuevo pedido (Público)
 * Recibe: { clientName, clientPhone, deliveryType, deliveryAddress, deliveryNotes, paymentMethod, paymentReference, paymentReceipt, bcvRate, items }
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    const db = env.DB || env.fogon;

    await ensureOrderColumns(db);

    try {
        const data = await request.json();
        const {
            clientName,
            clientPhone,
            deliveryType = 'retiro',
            deliveryAddress = '',
            deliveryNotes = '',
            paymentMethod = '',
            paymentReference = '',
            paymentReceipt = null,
            bcvRate = null,
            items
        } = data;

        // Validaciones estrictas de entrada
        if (!clientName || typeof clientName !== 'string' || !clientName.trim() ||
            !clientPhone || typeof clientPhone !== 'string' || !clientPhone.trim() ||
            !items || !Array.isArray(items) || items.length === 0) {
            return new Response(JSON.stringify({ error: "Datos del pedido incompletos o inválidos." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const cleanClientName = clientName.trim().slice(0, 100);
        const cleanClientPhone = clientPhone.trim().slice(0, 30);
        const cleanDeliveryType = deliveryType === 'delivery' ? 'delivery' : 'retiro';
        const cleanDeliveryAddress = (deliveryAddress || '').trim().slice(0, 300);
        const cleanDeliveryNotes = (deliveryNotes || '').trim().slice(0, 500);
        const cleanPaymentMethod = (paymentMethod || '').trim().slice(0, 50);
        const cleanPaymentReference = (paymentReference || '').trim().slice(0, 100);
        
        // Validación de comprobante de pago (Data URL JPEG/PNG/WebP, max ~1.8MB)
        let cleanPaymentReceipt = null;
        if (paymentReceipt && typeof paymentReceipt === 'string') {
            if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(paymentReceipt.slice(0, 100))) {
                if (paymentReceipt.length <= 2500000) { // ~1.8MB en Base64
                    cleanPaymentReceipt = paymentReceipt;
                }
            }
        }

        if (cleanDeliveryType === 'delivery' && !cleanDeliveryAddress) {
            return new Response(JSON.stringify({ error: "La dirección es requerida para el delivery." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Generar un ID de pedido y verificar que no exista (bucle de seguridad)
        let orderId = generateOrderId();
        let isUnique = false;
        let attempts = 0;
        
        while (!isUnique && attempts < 5) {
            const existing = await db.prepare("SELECT id FROM orders WHERE id = ?").bind(orderId).first();
            if (!existing) {
                isUnique = true;
            } else {
                orderId = generateOrderId();
                attempts++;
            }
        }

        // Cargar catálogo de la base de datos para mapeo confiable de precios e IDs
        const { results: dbProducts } = await db.prepare("SELECT id, name, price FROM products").all();
        const productMap = new Map();
        for (const p of dbProducts) {
            productMap.set(p.id, p);
        }

        // Obtener la tasa BCV guardada para garantizar exactitud financiera
        let finalBcvRate = 36.50;
        try {
            const bcvSetting = await db.prepare("SELECT value FROM settings WHERE key = 'bcv_rate'").first();
            if (bcvSetting && parseFloat(bcvSetting.value) > 0) {
                finalBcvRate = parseFloat(bcvSetting.value);
            } else if (bcvRate && parseFloat(bcvRate) > 0) {
                finalBcvRate = parseFloat(bcvRate);
            }
        } catch (e) {
            if (bcvRate && parseFloat(bcvRate) > 0) finalBcvRate = parseFloat(bcvRate);
        }

        let totalItems = 0;
        let totalPrice = 0.0;
        const statements = [];

        // 1. Sentencia para insertar el Pedido base
        statements.push(
            db.prepare(
                "INSERT INTO orders (id, client_name, client_phone, delivery_type, delivery_address, delivery_notes, payment_method, payment_reference, payment_receipt, bcv_rate, total_bs, status, total_items, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(
                orderId,
                cleanClientName,
                cleanClientPhone,
                cleanDeliveryType,
                cleanDeliveryAddress,
                cleanDeliveryNotes,
                cleanPaymentMethod,
                cleanPaymentReference,
                cleanPaymentReceipt,
                finalBcvRate,
                0.0,
                "pendiente",
                0,
                0.0
            )
        );

        // 2. Sentencias para insertar cada producto del pedido
        for (const item of items) {
            if (!item) continue;

            let matchedProduct = null;
            if (item.id && productMap.has(item.id)) {
                matchedProduct = productMap.get(item.id);
            } else if (item.key && productMap.has(item.key)) {
                matchedProduct = productMap.get(item.key);
            } else {
                matchedProduct = dbProducts.find(p => 
                    (item.key && (item.key === p.id || item.key.startsWith(p.id + '-'))) ||
                    (item.name && p.name.trim().toLowerCase() === String(item.name).trim().toLowerCase())
                );
            }

            const prodId = matchedProduct ? matchedProduct.id : (String(item.id || item.key || 'item').slice(0, 50));
            const price = matchedProduct ? parseFloat(matchedProduct.price) : (parseFloat(item.price) || 0.0);
            const qty = Math.max(1, Math.min(999, parseInt(item.qty) || 1));
            const prodName = (matchedProduct ? matchedProduct.name : (item.name || 'Plato')).slice(0, 150);
            
            let size = null;
            if (item.options && typeof item.options === 'object') {
                const entries = Object.entries(item.options).filter(([_, v]) => v);
                if (entries.length === 1 && entries[0][0] === 'size') {
                    size = String(entries[0][1]).slice(0, 100);
                } else if (entries.length > 0) {
                    const labels = {
                        size: 'Tamaño',
                        proteina: 'Proteína',
                        punto: 'Punto',
                        salsa: 'Salsa',
                        cantidad: 'Cantidad'
                    };
                    size = entries.map(([k, v]) => `${labels[k] || k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join(', ').slice(0, 200);
                }
            }

            totalItems += qty;
            totalPrice += price * qty;

            statements.push(
                db.prepare(
                    "INSERT INTO order_items (order_id, product_id, product_name, size, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?)"
                )
                .bind(
                    orderId,
                    prodId,
                    prodName,
                    size,
                    qty,
                    price
                )
            );
        }

        // Si es delivery, sumar los $5 de costo de envío
        if (cleanDeliveryType === 'delivery') {
            totalPrice += 5.0;
        }

        // Calcular total en Bolívares
        const totalBs = Math.round((totalPrice * finalBcvRate) * 100) / 100;

        // 3. Sentencia final para actualizar totales del pedido
        statements.push(
            db.prepare("UPDATE orders SET total_items = ?, total_price = ?, total_bs = ? WHERE id = ?")
            .bind(totalItems, totalPrice, totalBs, orderId)
        );

        // Ejecutar todas las sentencias de forma atómica en un lote D1
        await db.batch(statements);

        return new Response(JSON.stringify({ 
            success: true, 
            orderId, 
            totalItems, 
            totalPrice,
            totalBs,
            bcvRate: finalBcvRate
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en POST /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error al procesar el pedido. Por favor intenta de nuevo." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/orders - Actualizar estado de un pedido (Admin Only)
 * Recibe: { id, status, paymentMethod }
 */
export async function onRequestPut(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.fogon;

    await ensureOrderColumns(db);

    try {
        const { id, status, paymentMethod } = await request.json();

        if (!id || !status) {
            return new Response(JSON.stringify({ error: "ID y Estado son requeridos." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const validStatuses = ['pendiente', 'en_produccion', 'listo_entrega', 'completado', 'cancelado'];
        if (!validStatuses.includes(status)) {
            return new Response(JSON.stringify({ error: "Estado no válido." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Obtener el pedido actual
        const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
        if (!order) {
            return new Response(JSON.stringify({ error: "Pedido no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        const statements = [];

        // Actualizar el estado del pedido
        statements.push(
            db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id)
        );

        // Si el estado pasa a "completado", registrar venta en la tabla 'sales'
        if (status === "completado") {
            const existingSale = await db.prepare("SELECT id FROM sales WHERE order_id = ?").bind(id).first();
            
            if (!existingSale) {
                statements.push(
                    db.prepare(
                        "INSERT INTO sales (order_id, monto, metodo_pago, fecha) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
                    )
                    .bind(
                        id,
                        order.total_price,
                        paymentMethod || order.payment_method || "WhatsApp / Por acordar"
                    )
                );
            }
        }

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true, message: `Pedido ${id} actualizado a ${status}.` }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en PUT /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error interno al actualizar pedido." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * DELETE /api/orders - Eliminar un pedido (Admin Only)
 */
export async function onRequestDelete(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.fogon;

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(JSON.stringify({ error: "ID de pedido es requerido." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id).run();
        const result = await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();

        if (result.meta.changes === 0) {
            return new Response(JSON.stringify({ error: "Pedido no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, message: "Pedido eliminado." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en DELETE /api/orders:", err);
        return new Response(JSON.stringify({ error: "Error interno al eliminar pedido." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
