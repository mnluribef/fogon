import { verifySession, generateSalt, hashPasswordPBKDF2 } from "./_auth.js";

/**
 * GET /api/auth - Verifica el estado de la sesión actual
 */
export async function onRequestGet(context) {
    const username = await verifySession(context);
    
    if (username) {
        return new Response(JSON.stringify({ authenticated: true, username }), {
            headers: { "Content-Type": "application/json" }
        });
    }

    return new Response(JSON.stringify({ authenticated: false }), {
        headers: { "Content-Type": "application/json" }
    });
}

/**
 * POST /api/auth - Inicia sesión (Login)
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB || env.fogon;

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
            .bind(username.toLowerCase())
            .first();

        if (!user) {
            return new Response(JSON.stringify({ error: "Credenciales inválidas." }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        let isMatch = false;

        if (!user.password_salt) {
            // Caso 1: Usuario legacy con SHA-256 plano o columna no inicializada
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
            // Caso 2: Usuario migrado con PBKDF2
            const calculatedHash = await hashPasswordPBKDF2(passwordHash, user.password_salt);
            isMatch = (user.password_hash === calculatedHash);
        }

        if (!isMatch) {
            return new Response(JSON.stringify({ error: "Credenciales inválidas." }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Generar un token seguro de sesión
        const sessionToken = crypto.randomUUID();
        const maxAge = 7 * 24 * 60 * 60; // 7 días en segundos
        const expiresAt = Math.floor(Date.now() / 1000) + maxAge;

        // Registrar la sesión en la base de datos
        await db.prepare("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)")
            .bind(sessionToken, user.username, expiresAt)
            .run();

        // Responder estableciendo la cookie segura HTTP-only y retornando éxito
        const cookie = `fogon_session=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
        
        return new Response(JSON.stringify({ success: true, username: user.username }), {
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie": cookie
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
 * DELETE /api/auth - Cierra sesión (Logout)
 */
export async function onRequestDelete(context) {
    const { request, env } = context;
    const db = env.DB || env.fogon;

    // Obtener el token de la cookie
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
            // Eliminar de la base de datos
            await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        } catch (err) {
            console.error("Error eliminando sesión en logout:", err);
        }
    }

    // Limpiar la cookie del navegador
    const clearCookie = `fogon_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

    return new Response(JSON.stringify({ success: true }), {
        headers: {
            "Content-Type": "application/json",
            "Set-Cookie": clearCookie
        }
    });
}
