// Controlador de Tasa Oficial BCV - FOGÓN Restaurante
import { verifySession, unauthorizedResponse } from "./_auth.js";

const DEFAULT_FALLBACK_RATE = 36.50;
const EXTERNAL_API_URL = "https://ve.dolarapi.com/v1/dolares/oficial";

/**
 * Asegura la existencia de la tabla de settings en la base de datos
 */
async function ensureSettingsTable(db) {
    try {
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        await db.prepare(`
            INSERT OR IGNORE INTO settings (key, value) VALUES 
            ('bcv_rate', '36.50'),
            ('bcv_auto_update', '1'),
            ('bcv_updated_at', CURRENT_TIMESTAMP)
        `).run();
    } catch (e) {
        // Ignorar si ya existe
    }
}

/**
 * GET /api/bcv - Obtener la tasa oficial del día
 * Retorna tasa actual (cacheada o en vivo) en formato JSON
 */
export async function onRequestGet(context) {
    const { env } = context;
    const db = env.DB || env.fogon;

    await ensureSettingsTable(db);

    try {
        // Leer configuración actual de la base de datos
        const { results: rows } = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'bcv_%'").all();
        const settings = {};
        for (const row of rows || []) {
            settings[row.key] = row.value;
        }

        const autoUpdate = settings.bcv_auto_update !== '0';
        let currentRate = parseFloat(settings.bcv_rate) || DEFAULT_FALLBACK_RATE;
        let lastUpdated = settings.bcv_updated_at || new Date().toISOString();
        let source = autoUpdate ? 'cached' : 'manual';

        // Si auto_update está activo, verificar si han pasado más de 2 horas desde la última actualización
        const lastUpdatedMs = new Date(lastUpdated).getTime();
        const nowMs = Date.now();
        const twoHoursMs = 2 * 60 * 60 * 1000;

        if (autoUpdate && (isNaN(lastUpdatedMs) || nowMs - lastUpdatedMs > twoHoursMs)) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);

                const res = await fetch(EXTERNAL_API_URL, {
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const fetchedRate = parseFloat(data.promedio || data.price || 0);

                    if (fetchedRate > 0) {
                        currentRate = fetchedRate;
                        lastUpdated = data.fechaActualizacion || new Date().toISOString();
                        source = 'bcv_api';

                        // Guardar en base de datos
                        await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('bcv_rate', ?, CURRENT_TIMESTAMP)").bind(String(currentRate)).run();
                        await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('bcv_updated_at', ?, CURRENT_TIMESTAMP)").bind(lastUpdated).run();
                    }
                }
            } catch (fetchErr) {
                // Si la API externa falla o da timeout, continuamos transparentemente con el valor en caché
                console.warn("Fallo al consultar API BCV externa, usando caché:", fetchErr.message);
            }
        }

        return new Response(JSON.stringify({
            rate: currentRate,
            lastUpdated,
            autoUpdate,
            source
        }), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=60"
            }
        });
    } catch (err) {
        console.error("Error en GET /api/bcv:", err);
        return new Response(JSON.stringify({
            rate: DEFAULT_FALLBACK_RATE,
            lastUpdated: new Date().toISOString(),
            autoUpdate: true,
            source: 'fallback'
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/bcv - Actualizar manualmente la tasa o el modo de actualización (Admin Only)
 */
export async function onRequestPut(context) {
    const user = await verifySession(context);
    if (!user) return unauthorizedResponse();

    const { env, request } = context;
    const db = env.DB || env.fogon;

    await ensureSettingsTable(db);

    try {
        const body = await request.json();
        const { rate, autoUpdate } = body;

        if (rate !== undefined) {
            const numericRate = parseFloat(rate);
            if (isNaN(numericRate) || numericRate <= 0) {
                return new Response(JSON.stringify({ error: "La tasa debe ser un número positivo." }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }
            await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('bcv_rate', ?, CURRENT_TIMESTAMP)").bind(numericRate.toFixed(2)).run();
        }

        if (autoUpdate !== undefined) {
            const autoVal = autoUpdate ? '1' : '0';
            await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('bcv_auto_update', ?, CURRENT_TIMESTAMP)").bind(autoVal).run();
        }

        const now = new Date().toISOString();
        await db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('bcv_updated_at', ?, CURRENT_TIMESTAMP)").bind(now).run();

        return new Response(JSON.stringify({
            success: true,
            message: "Tasa BCV configurada exitosamente.",
            rate: rate !== undefined ? parseFloat(rate) : undefined,
            autoUpdate
        }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Error en PUT /api/bcv:", err);
        return new Response(JSON.stringify({ error: "Error al actualizar tasa BCV." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
