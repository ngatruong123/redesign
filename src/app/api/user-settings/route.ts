import { NextRequest, NextResponse } from 'next/server';
import { getAuthUsername } from '@/auth';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';

const ALLOWED_KEYS = ['gemini_api_key', 'gemini_model'];
const SENSITIVE_KEYS = ['gemini_api_key'];

function maskValue(key: string, value: string): string {
    if (!SENSITIVE_KEYS.includes(key)) return value;
    if (value.length <= 8) return '****';
    return value.slice(0, 4) + '****' + value.slice(-4);
}

async function getUser() {
    const username = await getAuthUsername();
    if (!username) return null;
    return prisma.user.findUnique({ where: { username }, select: { id: true } });
}

export async function GET() {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const settings = await prisma.userSetting.findMany({ where: { userId: user.id } });
    const result: Record<string, string> = {};
    for (const s of settings) {
        try {
            const decrypted = decrypt(s.value);
            result[s.key] = maskValue(s.key, decrypted);
        } catch {
            result[s.key] = '****';
        }
    }
    return NextResponse.json({
        settings: result,
        hasEnvKey: !!process.env.GEMINI_API_KEY,
    });
}

export async function PUT(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { key, value } = await req.json();
    if (!key || !ALLOWED_KEYS.includes(key)) {
        return NextResponse.json({ error: `Invalid key. Allowed: ${ALLOWED_KEYS.join(', ')}` }, { status: 400 });
    }
    if (!value || typeof value !== 'string') {
        return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }

    const encrypted = encrypt(value);
    await prisma.userSetting.upsert({
        where: { userId_key: { userId: user.id, key } },
        update: { value: encrypted },
        create: { userId: user.id, key, value: encrypted },
    });

    return NextResponse.json({ ok: true, masked: maskValue(key, value) });
}

export async function DELETE(req: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { key } = await req.json();
    if (!key || !ALLOWED_KEYS.includes(key)) {
        return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }

    await prisma.userSetting.deleteMany({ where: { userId: user.id, key } });
    return NextResponse.json({ ok: true });
}
