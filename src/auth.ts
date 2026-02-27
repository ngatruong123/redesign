import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const AUTH_COOKIE = 'design-tool-auth';
const AUTH_USER = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASS = process.env.AUTH_PASSWORD || 'design2026';

export async function verifyAuth(): Promise<boolean> {
    const cookieStore = await cookies();
    return cookieStore.get(AUTH_COOKIE)?.value === 'authenticated';
}

export async function checkCredentials(username: string, password: string): Promise<boolean> {
    if (username !== AUTH_USER) return false;

    // Support bcrypt-hashed passwords (starts with $2a$ or $2b$)
    if (AUTH_PASS.startsWith('$2a$') || AUTH_PASS.startsWith('$2b$')) {
        return bcrypt.compare(password, AUTH_PASS);
    }

    // Backward compat: plain text password
    return password === AUTH_PASS;
}

export { AUTH_COOKIE };
