// Controlador de Registro de Ventas - FOGÓN Restaurante
import { verifySession, unauthorizedResponse } from "./_auth.js";

/**
 * GET /api/sales - Listar todas las ventas registradas (Admin Only)
 */
export async function onRequestGet(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env } = context;
    const db = env.DB || env.fogon;

    try {
        // Consultar todas las ventas con información del pedido asociado (LEFT JOIN por robustez)
        const { results } = await db.prepare(`
            SELECT s.*, COALESCE(o.client_name, 'Cliente FOGÓN') as client_name, COALESCE(o.client_phone, '') as client_phone 
            FROM sales s 
            LEFT JOIN orders o ON s.order_id = o.id 
            ORDER BY s.fecha DESC
        `).all();

        return new Response(JSON.stringify(results), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    } catch (err) {
        console.error("Error en GET /api/sales:", err);
        return new Response(JSON.stringify({ error: "Error al consultar registro de ventas." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
