import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { AUTH_COOKIE } from '@/auth';

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { username, password, email } = body;

    // Validate username
    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20) {
        return NextResponse.json({ error: 'Username phải từ 3-20 ký tự' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return NextResponse.json({ error: 'Username chỉ được chứa chữ, số và _' }, { status: 400 });
    }

    // Validate password
    if (!password || typeof password !== 'string' || password.length < 8) {
        return NextResponse.json({ error: 'Mật khẩu phải ít nhất 8 ký tự' }, { status: 400 });
    }

    // Validate email (optional)
    if (email && typeof email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
    }

    // Check duplicate username
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        return NextResponse.json({ error: 'Username đã tồn tại' }, { status: 409 });
    }

    // Check duplicate email
    if (email) {
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
            return NextResponse.json({ error: 'Email đã được sử dụng' }, { status: 409 });
        }
    }

    // Create user
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
        data: {
            username,
            email: email || null,
            password: hashedPassword,
        },
    });

    // Auto-login
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, 'authenticated', {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax',
    });
    res.cookies.set('design-tool-user', username, {
        httpOnly: false,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax',
    });
    return res;
}
