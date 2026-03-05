import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
    return crypto.randomUUID();
}

export async function setCsrfCookie(): Promise<string> {
    const token = generateCsrfToken();
    const cookieStore = await cookies();
    cookieStore.set(CSRF_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 86400,
    });
    return token;
}

export async function validateCsrf(request: NextRequest): Promise<NextResponse | null> {
    // Skip for GET/HEAD/OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;

    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
    const headerToken = request.headers.get(CSRF_HEADER);

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    return null;
}
