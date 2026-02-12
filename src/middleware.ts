import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limiter';

const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
    '/api/generate': { limit: 5, windowMs: 60_000 },
    '/api/generate-stream': { limit: 5, windowMs: 60_000 },
    '/api/upload': { limit: 20, windowMs: 60_000 },
    '/api/mockup': { limit: 10, windowMs: 60_000 },
    '/api/remove-bg': { limit: 10, windowMs: 60_000 },
};

const DEFAULT_LIMIT = { limit: 60, windowMs: 60_000 };

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only rate limit API routes
    if (!pathname.startsWith('/api/')) return NextResponse.next();

    // Skip file serving
    if (pathname.startsWith('/api/files/')) return NextResponse.next();

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';

    // Find matching rate limit config
    const configKey = Object.keys(RATE_LIMITS).find((k) => pathname.startsWith(k));
    const config = configKey ? RATE_LIMITS[configKey] : DEFAULT_LIMIT;

    const key = `${ip}:${configKey || pathname}`;
    const result = checkRateLimit(key, config.limit, config.windowMs);

    if (!result.allowed) {
        const retrySeconds = Math.ceil(result.retryAfterMs / 1000);
        return NextResponse.json(
            { error: `Vui lòng chờ ${retrySeconds}s trước khi thử lại` },
            {
                status: 429,
                headers: { 'Retry-After': String(retrySeconds) },
            },
        );
    }

    return NextResponse.next();
}

export const config = {
    matcher: '/api/:path*',
};
