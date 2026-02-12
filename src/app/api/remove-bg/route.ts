import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { resolvePublicPath } from '@/lib/resolve-path';
import { ensureStorageDir } from '@/lib/storage';

export async function POST(request: NextRequest) {
    try {
        const OUTPUT_DIR = await ensureStorageDir('variations');

        const body = await request.json();
        const { imageUrl } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: 'No image URL' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
        }

        // Read source image
        const absolutePath = resolvePublicPath(imageUrl);
        if (!absolutePath) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        const fileBuffer = await readFile(absolutePath);
        const base64Image = fileBuffer.toString('base64');

        // Detect mime type
        const ext = path.extname(imageUrl).toLowerCase();
        const mimeType = ext === '.svg' ? 'image/svg+xml'
            : ext === '.webp' ? 'image/webp'
                : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                    : 'image/png';

        // Use Gemini to remove background
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: 'Remove the background from this image completely. Make the background fully transparent (alpha channel = 0). Keep the main subject with clean, sharp, precise edges — no blur, no feathering, no artifacts around the edges. The output must be a PNG image with a transparent background. Do NOT add any new elements or modify the subject — only remove the background.',
                        },
                        {
                            inlineData: {
                                mimeType,
                                data: base64Image,
                            },
                        },
                    ],
                },
            ],
            generationConfig: {
                responseModalities: ['IMAGE'],
            },
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Gemini bg removal error:', errText);
            return NextResponse.json(
                { error: `Gemini API error: ${response.status}` },
                { status: 502 }
            );
        }

        const data = await response.json();

        // Extract image from response
        const candidates = data?.candidates;
        if (!candidates || candidates.length === 0) {
            return NextResponse.json({ error: 'No response from Gemini' }, { status: 502 });
        }

        const parts = candidates[0]?.content?.parts;
        if (!parts) {
            return NextResponse.json({ error: 'Invalid Gemini response' }, { status: 502 });
        }

        // Find image part
        let resultBase64: string | null = null;
        let resultMimeType: string = 'image/png';
        for (const part of parts) {
            if (part.inlineData?.data) {
                resultBase64 = part.inlineData.data;
                resultMimeType = part.inlineData.mimeType || 'image/png';
                break;
            }
        }

        if (!resultBase64) {
            return NextResponse.json({ error: 'No image in Gemini response' }, { status: 502 });
        }

        // Convert to PNG with transparency using sharp
        // Gemini may return JPEG (no alpha) or PNG with white background instead of transparent
        const inputBuffer = Buffer.from(resultBase64, 'base64');

        // Convert to PNG with transparency using sharp
        // Gemini may return JPEG (no alpha) — need to convert and remove white bg
        let outputBuffer: Buffer;

        if (resultMimeType.includes('jpeg') || resultMimeType.includes('jpg')) {
            const { data, info } = await sharp(inputBuffer)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            // Remove white/near-white pixels (make them transparent)
            const threshold = 240;
            const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            for (let i = 0; i < info.width * info.height; i++) {
                const off = i * 4;
                if (pixels[off] >= threshold && pixels[off + 1] >= threshold && pixels[off + 2] >= threshold) {
                    pixels[off + 3] = 0;
                }
            }

            outputBuffer = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png()
                .toBuffer();
        } else {
            outputBuffer = await sharp(inputBuffer).png().toBuffer();
        }

        // Save result
        const resultId = uuidv4();
        const filename = `${resultId}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        await writeFile(filepath, outputBuffer);

        return NextResponse.json({ url: `/api/files/variations/${filename}` });
    } catch (error) {
        console.error('Remove BG error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Remove BG failed' },
            { status: 500 }
        );
    }
}
