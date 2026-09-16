// Controlador de Pedidos y Ventas - Fogon
import { verifySession, unauthorizedResponse } from "./_auth.js";

/**
 * Genera un ID de pedido único y corto (ej: SUB-X9F4E)
 */
function generateOrderId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `SUB-${ts}${rand}`;
}

/**
 * GET /api/orders - Listar pedidos o ver detalle de un pedido (Admin Only)
 */
export async function onRequestGet(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.fogon;
    
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
            
            // Obtener también los items de forma agrupada para evitar N+1 en el panel (opcional, pero excelente para dashboard)
            // Para simplificar la vista general, el dashboard puede cargar detalles bajo demanda, 
            // pero incluiremos la lista de pedidos simple primero.
            return new Response(JSON.stringify(orders), {
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * POST /api/orders - Crear un nuevo pedido (Público)
 * Recibe: { clientName, clientPhone, items }
 */
export async function onRequestPost(context) {
    const { env, request } = context;
    const db = env.DB || env.fogon;

    try {
        const data = await request.json();
        const { clientName, clientPhone, deliveryType = 'retiro', deliveryAddress = '', deliveryNotes = '', paymentMethod = '', paymentReference = '', items } = data;

        if (!clientName || !clientPhone || !items || !Array.isArray(items) || items.length === 0) {
            return new Response(JSON.stringify({ error: "Datos del pedido incompletos o inválidos." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }
        
        if (deliveryType === 'delivery' && !deliveryAddress.trim()) {
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

        // Calcular cantidades y precios totales
        let totalItems = 0;
        let totalPrice = 0.0;
        
        // Cargar precios de productos para validar en base de datos
        const { results: dbProducts } = await db.prepare("SELECT id, price FROM products").all();
        const productPriceMap = dbProducts.reduce((acc, p) => {
            acc[p.id] = p.price;
            return acc;
        }, {});

        // Crear sentencias para batching (Transacción D1)
        const statements = [];

        // 1. Sentencia para insertar el Pedido
        statements.push(
            db.prepare(
                "INSERT INTO orders (id, client_name, client_phone, delivery_type, delivery_address, delivery_notes, payment_method, payment_reference, status, total_items, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(
                orderId,
                clientName.trim(),
                clientPhone.trim(),
                deliveryType,
                deliveryAddress.trim(),
                deliveryNotes.trim(),
                paymentMethod,
                paymentReference.trim(),
                "pendiente",
                totalItems, // Se actualizará al final
                totalPrice // Se actualizará al final
            )
        );

        // 2. Sentencias para insertar cada producto del pedido
        for (const item of items) {
            // Mapear el key del producto a su ID de base de datos
            // Por ejemplo, "taza" -> "taza", "franela-S" -> "franela"
            const prodId = item.key.split("-")[0];
            const price = productPriceMap[prodId] || 0.0;
            const qty = parseInt(item.qty) || 1;
            
            let size = null;
            if (item.options && typeof item.options === 'object') {
                const entries = Object.entries(item.options).filter(([_, v]) => v);
                if (entries.length === 1 && entries[0][0] === 'size') {
                    size = entries[0][1];
                } else if (entries.length > 0) {
                    const labels = {
                        size: 'Talla',
                        color: 'Color',
                        finish: 'Acabado',
                        capacity: 'Capacidad'
                    };
                    size = entries.map(([k, v]) => `${labels[k] || k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`).join(', ');
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
                    item.name,
                    size,
                    qty,
                    price
                )
            );
        }

        if (deliveryType === 'delivery') {
            totalPrice += 5.0;
        }

        // 3. Sentencia final para actualizar totales del pedido
        statements.push(
            db.prepare("UPDATE orders SET total_items = ?, total_price = ? WHERE id = ?")
            .bind(totalItems, totalPrice, orderId)
        );

        // Ejecutar todas las sentencias de forma atómica en un lote
        await db.batch(statements);

        return new Response(JSON.stringify({ 
            success: true, 
            orderId, 
            totalItems, 
            totalPrice 
        }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
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

    try {
        const { id, status, paymentMethod } = await request.json();

        if (!id || !status) {
            return new Response(JSON.stringify({ error: "ID y Estado son requeridos." }), {
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
            db.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, id)
        );

        // Si el estado pasa a "completado", registrar venta en la tabla 'sales'
        if (status === "completado") {
            // Verificar si ya hay una venta registrada para este pedido
            const existingSale = await db.prepare("SELECT id FROM sales WHERE order_id = ?").bind(id).first();
            
            if (!existingSale) {
                statements.push(
                    db.prepare(
                        "INSERT INTO sales (order_id, monto, metodo_pago, fecha) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
                    )
                    .bind(
                        id,
                        order.total_price,
                        paymentMethod || "WhatsApp / Por acordar"
                    )
                );
            }
        }

        await db.batch(statements);

        return new Response(JSON.stringify({ success: true, message: `Pedido ${id} actualizado a ${status}.` }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
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

        // Eliminar pedido (los items se eliminan por CASCADE en SQLite si está habilitado FK, 
        // pero por seguridad también los borramos explícitamente en lote si es necesario).
        const statements = [
            db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
            db.prepare("DELETE FROM sales WHERE order_id = ?").bind(id),
            db.prepare("DELETE FROM orders WHERE id = ?").bind(id)
        ];

        const results = await db.batch(statements);
        
        // El último elemento corresponde al borrado de orders
        if (results[2].meta.changes === 0) {
            return new Response(JSON.stringify({ error: "Pedido no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, message: "Pedido eliminado del sistema." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
