import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getUserApiKey } from '@/lib/get-user-api-key';

export async function POST(req: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;

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
    const userKey = await getUserApiKey('gemini_api_key');
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
    const userKey = await getUserApiKey('ideogram_api_key');
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
