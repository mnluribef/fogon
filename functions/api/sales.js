// Controlador de Registro de Ventas - Fogon
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
        // Consultar todas las ventas con información del pedido asociado
        const { results } = await db.prepare(`
            SELECT s.*, o.client_name, o.client_phone 
            FROM sales s 
            JOIN orders o ON s.order_id = o.id 
            ORDER BY s.fecha DESC
        `).all();

        return new Response(JSON.stringify(results), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
