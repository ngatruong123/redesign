import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { resolveToBuffer } from '@/lib/blob-storage';

const API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
    try {
        if (!API_KEY) {
            return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not configured' }, { status: 500 });
        }

        const { imageUrl, prompt, duration, aspectRatio = '16:9' } = await req.json();
        if (!imageUrl || !prompt) {
            return NextResponse.json({ error: 'imageUrl and prompt are required' }, { status: 400 });
        }

        const validRatios = ['16:9', '9:16'];
        const ratio = validRatios.includes(aspectRatio) ? aspectRatio : '16:9';

        // Read image via storage abstraction
        const imageBuffer = await resolveToBuffer(imageUrl);
        const ext = imageUrl.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const operation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt,
            image: {
                imageBytes: imageBuffer.toString('base64'),
                mimeType,
            },
            config: {
                aspectRatio: ratio,
                ...(duration && [4, 6, 8].includes(Number(duration)) ? { durationSeconds: Number(duration) } : {}),
            },
        });

        if (!operation.name) {
            return NextResponse.json({ error: 'No operation name returned' }, { status: 500 });
        }

        return NextResponse.json({ operationName: operation.name });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Veo] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
