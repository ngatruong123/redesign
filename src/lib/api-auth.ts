import { NextResponse } from 'next/server';
import { getAuthUsername } from '@/auth';

/**
 * Auth guard for API routes. Returns a 401 response if not authenticated, null if OK.
 */
export async function requireAuth(): Promise<NextResponse | null> {
    const username = await getAuthUsername();
    if (!username) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return null;
}
