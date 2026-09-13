// Auxiliar de Autenticación para API de BELARA

/**
 * Obtiene el token de la sesión desde las Cookies o el encabezado Authorization
 * @param {Request} request 
 */
function getTokenFromRequest(request) {
    // 1. Intentar desde el encabezado Authorization: Bearer <token>
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }

    // 2. Intentar desde las Cookies: session=<token>
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader) {
        const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split("=");
            acc[key] = value;
            return acc;
        }, {});
        return cookies["fogon_session"];
    }

    return null;
}

/**
 * Verifica si la sesión es válida y está activa en la base de datos D1
 * @param {object} context - Contexto de la función de Cloudflare Pages
 * @returns {Promise<string|null>} Retorna el nombre de usuario si es válida, o null.
 */
export async function verifySession(context) {
    const { request, env } = context;
    const db = env.DB || env.fogon;

    const token = getTokenFromRequest(request);
    if (!token) return null;

    try {
        const now = Math.floor(Date.now() / 1000);
        const session = await db.prepare(
            "SELECT username FROM sessions WHERE token = ? AND expires_at > ?"
        )
        .bind(token, now)
        .first();

        if (session) {
            return session.username;
        }
    } catch (err) {
        console.error("Error verificando sesión:", err);
    }

    return null;
}

/**
 * Convierte un string hexadecimal a Uint8Array
 */
export function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Convierte un Uint8Array a un string hexadecimal
 */
export function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Genera un salt aleatorio en formato hexadecimal (128 bits)
 */
export function generateSalt() {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    return bytesToHex(saltBytes);
}

/**
 * Hashea una contraseña (recibida como hash SHA-256) usando PBKDF2 con 100,000 iteraciones
 */
export async function hashPasswordPBKDF2(passwordHash, saltHex) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(passwordHash),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );
    const derivedKeyBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: hexToBytes(saltHex),
            iterations: 100000,
            hash: "SHA-256"
        },
        passwordKey,
        256
    );
    return bytesToHex(new Uint8Array(derivedKeyBits));
}

/**
 * Retorna una respuesta de error 401 Unauthorized
 */
export function unauthorizedResponse() {
    return new Response(JSON.stringify({ error: "No autorizado. Sesión inválida o expirada." }), {
        status: 401,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

