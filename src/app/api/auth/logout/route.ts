import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/auth';

export async function POST() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
}
