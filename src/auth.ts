import { cookies } from 'next/headers';

const AUTH_COOKIE = 'design-tool-auth';
const AUTH_USER = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASS = process.env.AUTH_PASSWORD || 'design2026';

export async function verifyAuth(): Promise<boolean> {
    const cookieStore = await cookies();
    return cookieStore.get(AUTH_COOKIE)?.value === 'authenticated';
}

export function checkCredentials(username: string, password: string): boolean {
    return username === AUTH_USER && password === AUTH_PASS;
}

export { AUTH_COOKIE };
