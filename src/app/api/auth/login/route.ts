import { NextRequest, NextResponse } from 'next/server';
import { checkCredentials, createAuthToken, AUTH_COOKIE, authCookieOptions } from '@/auth';
import { checkRateLimit } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimited = checkRateLimit(`login:${ip}`, 5, 60_000);
    if (rateLimited) {
        return NextResponse.json({ error: 'Quá nhiều lần thử. Vui lòng đợi 1 phút.' }, { status: 429 });
    }

    const body = await request.json();
    const { username, password } = body;

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        return NextResponse.json({ error: 'Username và password không được để trống' }, { status: 400 });
    }

    if (!(await checkCredentials(username, password))) {
        return NextResponse.json({ error: 'Sai tài khoản hoặc mật khẩu' }, { status: 401 });
    }

    const token = await createAuthToken(username);
    const res = NextResponse.json({ ok: true, username });
    res.cookies.set(AUTH_COOKIE, token, authCookieOptions());
    return res;
}
