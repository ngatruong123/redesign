import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/register', '/api/auth', '/landing'];

function getSecret(): Uint8Array | null {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;
    return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    const secret = getSecret();
    if (!secret) {
        return NextResponse.redirect(new URL('/landing', request.url));
    }

    const token = request.cookies.get('design-tool-auth')?.value;
    if (!token) {
        return NextResponse.redirect(new URL('/landing', request.url));
    }

    try {
        await jwtVerify(token, secret);
        return NextResponse.next();
    } catch {
        return NextResponse.redirect(new URL('/landing', request.url));
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
