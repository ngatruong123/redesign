import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getUserApiKey } from '@/lib/get-user-api-key';

export async function POST(req: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;

    try {
        const { apiKey: providedKey } = await req.json();

        // Use provided key, or fall back to saved user key, or env key
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
    } catch (err) {
        return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
}
