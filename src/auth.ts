import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@/lib/db';

const AUTH_COOKIE = 'design-tool-auth';
const AUTH_USER = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASS = process.env.AUTH_PASSWORD;

function getSecret(): Uint8Array {
    const secret = process.env.AUTH_SECRET || process.env.AUTH_PASSWORD;
    if (!secret) throw new Error('AUTH_SECRET or AUTH_PASSWORD must be set');
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
    } catch {
        return null;
    }
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
    // Try DB first
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (user) {
            return bcrypt.compare(password, user.password);
        }
    } catch {
        // DB not available, fall through to env-based auth
    }

    // Fallback to env-based auth
    if (!AUTH_PASS) return false;
    if (username !== AUTH_USER) return false;

    if (AUTH_PASS.startsWith('$2a$') || AUTH_PASS.startsWith('$2b$')) {
        return bcrypt.compare(password, AUTH_PASS);
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
