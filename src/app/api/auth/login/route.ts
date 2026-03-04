import { NextRequest, NextResponse } from 'next/server';
import { checkCredentials, createAuthToken, AUTH_COOKIE, authCookieOptions } from '@/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { prisma } from '@/lib/db';
import { loginSchema } from '@/lib/validators';

export async function POST(request: NextRequest) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = checkRateLimit(`login:${ip}`, 5, 60_000);
    if (!allowed) {
        return NextResponse.json({ error: 'Quá nhiều lần thử. Vui lòng đợi 1 phút.' }, { status: 429 });
    }

    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
        return NextResponse.json({ error: 'Username và password không được để trống' }, { status: 400 });
    }
    const { username, password } = parsed.data;

    if (!(await checkCredentials(username, password))) {
        return NextResponse.json({ error: 'Sai tài khoản hoặc mật khẩu' }, { status: 401 });
    }

    // Ensure user exists in DB for workspace/data persistence
    try {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (!existing) {
            await prisma.user.create({
                data: { username, password: '___env_auth___' },
            });
        }
    } catch {
        // DB not available — workspaces will fallback to localStorage
    }

    const token = await createAuthToken(username);
    const res = NextResponse.json({ ok: true, username });
    res.cookies.set(AUTH_COOKIE, token, authCookieOptions());
    return res;
}
