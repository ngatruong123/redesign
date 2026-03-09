import { NextRequest, NextResponse } from 'next/server';
import { getAuthUsername } from '@/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

async function getKeyFromDb(settingKey: string): Promise<string | null> {
    try {
        const username = await getAuthUsername();
        console.log(`[test] getKeyFromDb(${settingKey}): username=${username}`);
        if (!username) return null;
        const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
        console.log(`[test] getKeyFromDb(${settingKey}): userId=${user?.id}`);
        if (!user) return null;
        const setting = await prisma.userSetting.findUnique({
            where: { userId_key: { userId: user.id, key: settingKey } },
        });
        console.log(`[test] getKeyFromDb(${settingKey}): setting found=${!!setting}, valueLen=${setting?.value?.length}`);
        if (!setting) return null;
        const decrypted = decrypt(setting.value);
        console.log(`[test] getKeyFromDb(${settingKey}): decrypted OK, len=${decrypted.length}`);
        return decrypted;
    } catch (err) {
        console.error(`[test] getKeyFromDb(${settingKey}) failed:`, err instanceof Error ? err.message : err);
        return null;
    }
}

export async function POST(req: NextRequest) {
    const username = await getAuthUsername();
    if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { apiKey: providedKey, provider: providerType } = await req.json();

        if (providerType === 'ideogram') {
            return testIdeogramKey(providedKey);
        }

        return testGeminiKey(providedKey);
    } catch (err) {
        return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
}

async function testGeminiKey(providedKey?: string) {
    const userKey = await getKeyFromDb('gemini_api_key');
    const apiKey = providedKey || userKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'Không có API key' });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
            generationConfig: { responseModalities: ['TEXT'], maxOutputTokens: 10 },
        }),
    });

    if (res.ok) {
        return NextResponse.json({ ok: true });
    }

    const errorText = await res.text();
    return NextResponse.json({ ok: false, error: `API error (${res.status}): ${errorText.slice(0, 200)}` });
}

async function testIdeogramKey(providedKey?: string) {
    const userKey = await getKeyFromDb('ideogram_api_key');
    console.log(`[test-ideogram] providedKey=${!!providedKey}, userKey=${!!userKey}, envKey=${!!process.env.IDEOGRAM_API_KEY}`);
    const apiKey = providedKey || userKey || process.env.IDEOGRAM_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'Không có Ideogram API key' });
    }

    // Test key by calling POST /describe with empty file
    // Valid key → 400/422 (bad input), invalid key → 401
    const formData = new FormData();
    formData.append('image_file', new Blob([]), 'test.png');

    const res = await fetch('https://api.ideogram.ai/describe', {
        method: 'POST',
        headers: { 'Api-Key': apiKey },
        body: formData,
    });

    // 401 = bad key, anything else = key is valid
    if (res.status === 401) {
        return NextResponse.json({ ok: false, error: 'API key không hợp lệ' });
    }

    return NextResponse.json({ ok: true });
}
