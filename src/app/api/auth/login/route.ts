import { NextRequest, NextResponse } from 'next/server';
import { checkCredentials, AUTH_COOKIE } from '@/auth';

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { username, password } = body;

    if (!checkCredentials(username, password)) {
        return NextResponse.json({ error: 'Sai tài khoản hoặc mật khẩu' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, 'authenticated', {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax',
    });
    return res;
}
