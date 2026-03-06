import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createAuthToken, AUTH_COOKIE, authCookieOptions } from '@/auth';
import { registerSchema } from '@/lib/validators';

export async function POST(request: NextRequest) {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { username, password, email } = parsed.data;

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

    // Auto-login with JWT
    const token = await createAuthToken(username);
    const res = NextResponse.json({ ok: true, username });
    res.cookies.set(AUTH_COOKIE, token, authCookieOptions());
    return res;
}
