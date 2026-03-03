import { NextResponse } from 'next/server';
import { AUTH_COOKIE, authCookieOptions } from '@/auth';

export async function POST() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, '', { ...authCookieOptions(), maxAge: 0 });
    return res;
}
