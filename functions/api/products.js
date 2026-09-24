// Controlador de Catálogo de Productos - FOGÓN Restaurante
import { verifySession, unauthorizedResponse } from "./_auth.js";

/**
 * GET /api/products - Listar productos
 * - Clientes: Retorna productos activos (active = 1)
 * - Admin (con admin=true en URL y sesión activa): Retorna todos los productos
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    const db = env.DB || env.fogon;
    
    // Analizar parámetros URL
    const url = new URL(request.url);
    const isAdminMode = url.searchParams.get("admin") === "true";

    try {
        let products;
        
        if (isAdminMode) {
            // Verificar sesión para mostrar inactivos y permitir administración
            const user = await verifySession(context);
            if (!user) return unauthorizedResponse();

            const { results } = await db.prepare("SELECT * FROM products ORDER BY created_at DESC").all();
            products = results;
        } else {
            // Catálogo público: solo activos
            const { results } = await db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY created_at ASC").all();
            products = results;
        }

        // Cargar y agrupar atributos dinámicos
        const { results: allAttributes } = await db.prepare("SELECT * FROM product_attributes").all();
        const attrsMap = {};
        for (const attr of allAttributes) {
            if (!attrsMap[attr.product_id]) {
                attrsMap[attr.product_id] = [];
            }
            let parsedValues = [];
            try {
                parsedValues = JSON.parse(attr.attr_values);
            } catch (e) {
                parsedValues = attr.attr_values ? attr.attr_values.split(",") : [];
            }
            let parsedPriceMatrix = {};
            try {
                parsedPriceMatrix = JSON.parse(attr.price_matrix);
            } catch (e) {
                parsedPriceMatrix = {};
            }
            attrsMap[attr.product_id].push({
                id: attr.id,
                key: attr.attr_key,
                label: attr.attr_label,
                values: parsedValues,
                type: attr.attr_type || 'select',
                price_matrix: parsedPriceMatrix,
                required: attr.required === 1
            });
        }

        // Adjuntar atributos y normalizar categorías a cada producto
        for (const product of products) {
            product.type_id = product.type_id || product.category || 'principales';
            product.category = product.category || product.type_id;
            product.attributes = attrsMap[product.id] || [];
        }

        const cacheControl = isAdminMode 
            ? "no-store, no-cache, must-revalidate" 
            : "public, max-age=10";

        return new Response(JSON.stringify(products), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": cacheControl
            }
        });
    } catch (err) {
        console.error("Error en GET /api/products:", err);
        return new Response(JSON.stringify({ error: "Error interno al consultar productos." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * POST /api/products - Agregar nuevo producto (Admin Only)
 */
export async function onRequestPost(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.fogon;

    let productId = "";
    try {
        const data = await request.json();
        const { id, name, description, price, category, icon, image_url, sizes, active } = data;

        if (!id || !name) {
            return new Response(JSON.stringify({ error: "ID (slug) y Nombre son requeridos." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        productId = id.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
        const cleanCategory = (category || 'principales').toLowerCase().trim();

        // Validar si el ID ya existe
        const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
        if (existing) {
            return new Response(JSON.stringify({ error: `El identificador "${productId}" ya está registrado.` }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare(
            "INSERT INTO products (id, name, type_id, category, description, price, icon, image_url, sizes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
            productId,
            name.trim().slice(0, 150),
            cleanCategory,
            cleanCategory,
            (description || "").trim().slice(0, 500),
            parseFloat(price) || 0.0,
            (icon || "utensils").trim().slice(0, 50),
            (image_url || "assets/product_placeholder.png").trim().slice(0, 300),
            sizes ? String(sizes).trim().slice(0, 200) : null,
            active !== undefined ? active : 1
        )
        .run();

        return new Response(JSON.stringify({ success: true, message: "Plato creado exitosamente en el menú." }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en POST /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al guardar el plato en la base de datos." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/products - Modificar producto existente (Admin Only)
 */
export async function onRequestPut(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.fogon;

    try {
        const data = await request.json();
        const { id, name, description, price, category, icon, image_url, sizes, active } = data;

        if (!id) {
            return new Response(JSON.stringify({ error: "ID de producto es requerido para actualizar." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Verificar si el producto existe
        const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
        if (!existing) {
            return new Response(JSON.stringify({ error: "Producto no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        const cleanCategory = (category || existing.category || 'principales').toLowerCase().trim();

        await db.prepare(
            "UPDATE products SET name = ?, type_id = ?, category = ?, description = ?, price = ?, icon = ?, image_url = ?, sizes = ?, active = ? WHERE id = ?"
        )
        .bind(
            name.trim().slice(0, 150),
            cleanCategory,
            cleanCategory,
            (description || "").trim().slice(0, 500),
            parseFloat(price) || 0.0,
            (icon || "utensils").trim().slice(0, 50),
            (image_url || "assets/product_placeholder.png").trim().slice(0, 300),
            sizes ? String(sizes).trim().slice(0, 200) : null,
            active !== undefined ? active : 1,
            id
        )
        .run();

        return new Response(JSON.stringify({ success: true, message: "Plato actualizado exitosamente." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en PUT /api/products:", err);
        return new Response(JSON.stringify({ error: "Error al actualizar plato en base de datos." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * DELETE /api/products - Eliminar producto (Admin Only)
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
            return new Response(JSON.stringify({ error: "ID de producto es requerido." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare("DELETE FROM product_attributes WHERE product_id = ?").bind(id).run();
        const result = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();

        if (result.meta.changes === 0) {
            return new Response(JSON.stringify({ error: "Producto no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, message: "Plato eliminado del menú." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en DELETE /api/products:", err);
        return new Response(JSON.stringify({ error: "Error interno al eliminar plato." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
