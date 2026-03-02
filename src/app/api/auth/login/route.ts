import { NextRequest, NextResponse } from 'next/server';
import { checkCredentials, createAuthToken, AUTH_COOKIE, authCookieOptions } from '@/auth';

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { username, password } = body;

    if (!(await checkCredentials(username, password))) {
        return NextResponse.json({ error: 'Sai tài khoản hoặc mật khẩu' }, { status: 401 });
    }

    const token = await createAuthToken(username);
    const res = NextResponse.json({ ok: true, username });
    res.cookies.set(AUTH_COOKIE, token, authCookieOptions());
    return res;
}
