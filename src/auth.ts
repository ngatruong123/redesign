import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@/lib/db';

const AUTH_COOKIE = 'design-tool-auth';
const AUTH_USER = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASS = process.env.AUTH_PASSWORD;

function getSecret(): Uint8Array {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET must be set');
    return new TextEncoder().encode(secret);
}

export async function createAuthToken(username: string): Promise<string> {
    return new SignJWT({ sub: username })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(getSecret());
}

export async function verifyAuth(): Promise<boolean> {
    const username = await getAuthUsername();
    return username !== null;
}

export async function getAuthUsername(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(AUTH_COOKIE)?.value;
        if (!token) return null;
        const { payload } = await jwtVerify(token, getSecret());
        return (payload.sub as string) || null;
    } catch (err) {
        console.warn('[getAuthUsername] Error:', err);
        return null;
    }
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
    // Try DB first
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (user && user.password !== '___env_auth___') {
            return await bcrypt.compare(password, user.password);
        }
        // If user has dummy password (auto-created from env login), fall through to env-based auth
    } catch (err) {
        // DB not available, fall through to env-based auth
        console.warn('[checkCredentials] Error:', err);
    }

    // Fallback to env-based auth
    if (!AUTH_PASS) return false;
    if (username !== AUTH_USER) return false;

    // AUTH_PASS can be plaintext or bcrypt hash
    if (AUTH_PASS.startsWith('$2a$') || AUTH_PASS.startsWith('$2b$')) {
        return await bcrypt.compare(password, AUTH_PASS);
    }
    return password === AUTH_PASS;
}

export function authCookieOptions(secure?: boolean) {
    const isHttps = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') ?? false;
    return {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax' as const,
        secure: secure ?? isHttps,
    };
}

export { AUTH_COOKIE };
