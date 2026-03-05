import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (request: NextRequest, context?: any) => Promise<NextResponse | Response>;

/**
 * Wrap an API route handler with requireAuth.
 * Usage: export const POST = withAuth(async (request) => { ... });
 */
export function withAuth(handler: Handler): Handler {
    return async (request, context) => {
        const authError = await requireAuth();
        if (authError) return authError;
        return handler(request, context);
    };
}
