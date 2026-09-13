// Controlador de Catálogo de Productos - Fogon
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

        // Adjuntar atributos a cada producto
        for (const product of products) {
            product.attributes = attrsMap[product.id] || [];
        }

        const cacheControl = isAdminMode 
            ? "no-store, no-cache, must-revalidate" 
            : "public, max-age=5"; // Cache corto de 5s para catálogo público

        return new Response(JSON.stringify(products), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": cacheControl
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
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
            return new Response(JSON.stringify({ error: "ID y Nombre son campos requeridos." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        productId = id.toLowerCase().trim();

        // Validar si el ID único ya existe en la base de datos antes de intentar insertar
        const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
        if (existing) {
            return new Response(JSON.stringify({ error: `El ID único (Slug) "${productId}" ya está registrado para otro producto. Por favor elige uno diferente.` }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        await db.prepare(
            "INSERT INTO products (id, name, description, price, category, icon, image_url, sizes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
            productId,
            name.trim(),
            description || "",
            parseFloat(price) || 0.0,
            category || "general",
            icon || "package",
            image_url || "assets/product_placeholder.png",
            sizes || null,
            active !== undefined ? active : 1
        )
        .run();

        return new Response(JSON.stringify({ success: true, message: "Producto creado con éxito." }), {
            status: 201,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        let errorMessage = err.message;
        if (err.message.includes("UNIQUE constraint failed: products.id") || err.message.includes("SQLITE_CONSTRAINT")) {
            errorMessage = `El ID único (Slug) "${productId}" ya está registrado. Por favor, usa otro ID.`;
        }
        return new Response(JSON.stringify({ error: errorMessage }), {
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

        await db.prepare(
            "UPDATE products SET name = ?, description = ?, price = ?, category = ?, icon = ?, image_url = ?, sizes = ?, active = ? WHERE id = ?"
        )
        .bind(
            name.trim(),
            description || "",
            parseFloat(price) || 0.0,
            category || "general",
            icon || "package",
            image_url || "assets/product_placeholder.png",
            sizes || null,
            active !== undefined ? active : 1,
            id
        )
        .run();

        return new Response(JSON.stringify({ success: true, message: "Producto actualizado con éxito." }), {
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
            return new Response(JSON.stringify({ error: "ID de producto es requerido para eliminar." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Eliminar producto
        const result = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
        
        if (result.meta.changes === 0) {
            return new Response(JSON.stringify({ error: "Producto no encontrado." }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ success: true, message: "Producto eliminado con éxito." }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
