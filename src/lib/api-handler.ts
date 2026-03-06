import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import type { ZodSchema } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler<T = any> = (request: NextRequest, ctx: { body: T; ip: string }, routeCtx?: any) => Promise<NextResponse | Response>;

interface ApiHandlerOptions<T> {
    schema?: ZodSchema<T>;
    rateLimit?: { key?: string; max: number; windowMs: number };
    auth?: boolean;
}

/**
 * Create a standardized API route handler with auth, rate limiting, and validation.
 *
 * Usage:
 *   export const POST = createApiHandler({ auth: true, schema: mySchema, rateLimit: { max: 10, windowMs: 60_000 } },
 *     async (req, { body, ip }) => { ... }
 *   );
 */
export function createApiHandler<T = unknown>(
    options: ApiHandlerOptions<T>,
    handler: Handler<T>,
): Handler {
    return async (request, _ctx, routeCtx) => {
        // 1. Auth
        if (options.auth !== false) {
            const authError = await requireAuth();
            if (authError) return authError;
        }

        // 2. Rate limit
        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
        if (options.rateLimit) {
            const key = options.rateLimit.key ? `${options.rateLimit.key}:${ip}` : `api:${ip}`;
            const rl = checkRateLimit(key, options.rateLimit.max, options.rateLimit.windowMs);
            if (!rl.allowed) {
                return NextResponse.json(
                    { error: 'Rate limit exceeded' },
                    { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
                );
            }
        }

        // 3. Body validation
        let body: T = undefined as T;
        if (options.schema) {
            try {
                const raw = await request.json();
                const parsed = options.schema.safeParse(raw);
                if (!parsed.success) {
                    return NextResponse.json(
                        { error: parsed.error.issues[0]?.message || 'Invalid input' },
                        { status: 400 },
                    );
                }
                body = parsed.data;
            } catch {
                return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
            }
        }

        // 4. Call handler with error boundary
        try {
            return await handler(request, { body, ip }, routeCtx);
        } catch (error) {
            console.error('[API Error]', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    };
}

/**
 * Simple auth wrapper (legacy, prefer createApiHandler).
 */
export function withAuth(handler: Handler): Handler {
    return async (request, _ctx, routeCtx) => {
        const authError = await requireAuth();
        if (authError) return authError;
        return handler(request, _ctx, routeCtx);
    };
}
