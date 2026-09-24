import { verifySession, unauthorizedResponse, generateSalt, hashPasswordPBKDF2 } from "./_auth.js";

// Rate limiting simple en memoria por IP para mitigar fuerza bruta
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 5 * 60 * 1000; // 5 minutos de bloqueo

function checkRateLimit(ip) {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record) return { allowed: true };

    if (now < record.lockoutUntil) {
        const remainingMinutes = Math.ceil((record.lockoutUntil - now) / 60000);
        return { allowed: false, remainingMinutes };
    }

    // Si ya pasó el periodo de bloqueo, resetear
    if (now - record.firstAttempt > LOCKOUT_TIME_MS) {
        loginAttempts.delete(ip);
        return { allowed: true };
    }

    return { allowed: true };
}

function recordFailedAttempt(ip) {
    const now = Date.now();
    const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now, lockoutUntil: 0 };
    record.count++;
    if (record.count >= MAX_ATTEMPTS) {
        record.lockoutUntil = now + LOCKOUT_TIME_MS;
    }
    loginAttempts.set(ip, record);
}

function clearRateLimit(ip) {
    loginAttempts.delete(ip);
}

/**
 * GET /api/auth - Verifica el estado de la sesión actual
 */
export async function onRequestGet(context) {
    const username = await verifySession(context);
    
    // Limpieza oportunista de sesiones expiradas
    try {
        const { env } = context;
        const db = env.DB || env.fogon;
        const now = Math.floor(Date.now() / 1000);
        context.waitUntil?.(
            db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run()
        );
    } catch (_) {}

    if (username) {
        return new Response(JSON.stringify({ authenticated: true, username }), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            }
        });
    }

    return new Response(JSON.stringify({ authenticated: false }), {
        headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        }
    });
}

/**
 * POST /api/auth - Inicia sesión (Login)
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB || env.fogon;
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-real-ip") || "unknown";

    // 1. Verificar Rate Limit
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
        return new Response(JSON.stringify({ 
            error: `Demasiados intentos fallidos. Por seguridad, espera ${rateCheck.remainingMinutes} minuto(s) antes de reintentar.` 
        }), {
            status: 429,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const { username, passwordHash } = await request.json();

        if (!username || !passwordHash) {
            return new Response(JSON.stringify({ error: "Usuario y contraseña requeridos." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Buscar usuario en base de datos
        const user = await db.prepare("SELECT * FROM users WHERE username = ?")
            .bind(username.toLowerCase().trim())
            .first();

        if (!user) {
            recordFailedAttempt(clientIp);
            return new Response(JSON.stringify({ error: "Credenciales inválidas." }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        let isMatch = false;

        if (!user.password_salt) {
            // Caso 1: Usuario legacy con SHA-256 plano
            isMatch = (user.password_hash === passwordHash);
            
            if (isMatch) {
                // Migrar automáticamente al nuevo formato PBKDF2
                const newSalt = generateSalt();
                const newHash = await hashPasswordPBKDF2(passwordHash, newSalt);
                
                await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
                    .bind(newHash, newSalt, user.id)
                    .run();
            }
        } else {
            // Caso 2: Usuario con PBKDF2
            const calculatedHash = await hashPasswordPBKDF2(passwordHash, user.password_salt);
            isMatch = (user.password_hash === calculatedHash);
        }

        if (!isMatch) {
            recordFailedAttempt(clientIp);
            return new Response(JSON.stringify({ error: "Credenciales inválidas." }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Login exitoso: limpiar intentos fallidos
        clearRateLimit(clientIp);

        // Generar un token seguro de sesión
        const sessionToken = crypto.randomUUID();
        const maxAge = 7 * 24 * 60 * 60; // 7 días en segundos
        const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

        // Registrar la sesión en la base de datos
        await db.prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)")
            .bind(sessionToken, user.username, expiresAt)
            .run();

        // Cookie segura HTTP-only
        const cookie = `fogon_session=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
        
        return new Response(JSON.stringify({ success: true, username: user.username }), {
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie": cookie
            }
        });
    } catch (err) {
        console.error("Error en POST /api/auth:", err);
        return new Response(JSON.stringify({ error: "Error en el servidor al autenticar." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * PUT /api/auth - Cambiar contraseña del administrador (Requiere sesión activa)
 */
export async function onRequestPut(context) {
    const username = await verifySession(context);
    if (!username) return unauthorizedResponse();

    const { request, env } = context;
    const db = env.DB || env.fogon;

    try {
        const { currentPasswordHash, newPasswordHash } = await request.json();

        if (!currentPasswordHash || !newPasswordHash) {
            return new Response(JSON.stringify({ error: "Debes enviar la contraseña actual y la nueva." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const user = await db.prepare("SELECT * FROM users WHERE username = ?")
            .bind(username.toLowerCase().trim())
            .first();

        if (!user) {
            return unauthorizedResponse();
        }

        // Verificar contraseña actual
        let currentMatch = false;
        if (!user.password_salt) {
            currentMatch = (user.password_hash === currentPasswordHash);
        } else {
            const calculatedHash = await hashPasswordPBKDF2(currentPasswordHash, user.password_salt);
            currentMatch = (user.password_hash === calculatedHash);
        }

        if (!currentMatch) {
            return new Response(JSON.stringify({ error: "La contraseña actual es incorrecta." }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Generar nuevo salt y hash PBKDF2 para la nueva contraseña
        const newSalt = generateSalt();
        const newHash = await hashPasswordPBKDF2(newPasswordHash, newSalt);

        await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
            .bind(newHash, newSalt, user.id)
            .run();

        // Invalidar todas las sesiones antiguas excepto la actual si se desea, o cerrar todas por seguridad
        return new Response(JSON.stringify({ success: true, message: "Contraseña actualizada exitosamente." }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Error en PUT /api/auth:", err);
        return new Response(JSON.stringify({ error: "Error al actualizar contraseña." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

/**
 * DELETE /api/auth - Cierra sesión (Logout)
 */
export async function onRequestDelete(context) {
    const { request, env } = context;
    const db = env.DB || env.fogon;

    const cookieHeader = request.headers.get("Cookie");
    let token = null;
    if (cookieHeader) {
        const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split("=");
            acc[key] = value;
            return acc;
        }, {});
        token = cookies["fogon_session"];
    }

    if (token) {
        try {
            await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        } catch (err) {
            console.error("Error eliminando sesión en logout:", err);
        }
    }

    const clearCookie = `fogon_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

    return new Response(JSON.stringify({ success: true }), {
        headers: {
            "Content-Type": "application/json",
            "Set-Cookie": clearCookie
        }
    });
}
