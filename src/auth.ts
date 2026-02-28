import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

const AUTH_COOKIE = 'design-tool-auth';
const AUTH_USER = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASS = process.env.AUTH_PASSWORD || 'design2026';

export async function verifyAuth(): Promise<boolean> {
    const cookieStore = await cookies();
    return cookieStore.get(AUTH_COOKIE)?.value === 'authenticated';
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

    // Fallback to env-based auth (migration period)
    if (username !== AUTH_USER) return false;

    if (AUTH_PASS.startsWith('$2a$') || AUTH_PASS.startsWith('$2b$')) {
        return bcrypt.compare(password, AUTH_PASS);
    }

    return password === AUTH_PASS;
}

export { AUTH_COOKIE };
