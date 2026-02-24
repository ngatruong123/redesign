import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const API_KEY = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
    try {
        if (!API_KEY) {
            return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not configured' }, { status: 500 });
        }

        const { imageUrl, prompt, duration = 8, aspectRatio = '16:9' } = await req.json();
        if (!imageUrl || !prompt) {
            return NextResponse.json({ error: 'imageUrl and prompt are required' }, { status: 400 });
        }

        const validDurations = [4, 6, 8];
        const durationSec = validDurations.includes(duration) ? duration : 8;
        const validRatios = ['16:9', '9:16'];
        const ratio = validRatios.includes(aspectRatio) ? aspectRatio : '16:9';

        // Read image from disk
        const filePath = imageUrl.replace(/^\/api\/files\//, '');
        const fullPath = path.join(process.cwd(), '.design-tool-data', filePath);
        const imageBuffer = await readFile(fullPath);
        const data64 = imageBuffer.toString('base64');
        // Detect mime type from extension
        const ext = fullPath.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

        // Call Veo 3.1
        const url = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instances: [{ prompt, image: { bytesBase64Encoded: data64, mimeType } }],
                parameters: { aspectRatio: ratio, sampleCount: 1, durationSeconds: durationSec },
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: `Veo API error: ${err}` }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ operationName: data.name });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
