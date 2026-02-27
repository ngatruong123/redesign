import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const { imageUrl, productContext } = await req.json();
        if (!imageUrl) {
            return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const model = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';

        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
        }

        // Load image as base64
        let imageBase64: string;
        let mimeType = 'image/png';

        if (imageUrl.startsWith('/api/files/') || imageUrl.startsWith('/uploads/')) {
            // Local file
            const dataDir = path.join(process.cwd(), '.design-tool-data');
            const fileName = imageUrl.split('/').pop()!;
            const filePath = path.join(dataDir, fileName);
            if (!fs.existsSync(filePath)) {
                return NextResponse.json({ error: 'Image file not found' }, { status: 404 });
            }
            const buffer = fs.readFileSync(filePath);
            imageBase64 = buffer.toString('base64');
            if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (fileName.endsWith('.webp')) mimeType = 'image/webp';
        } else if (imageUrl.startsWith('data:')) {
            // Data URL
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) {
                return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 });
            }
            mimeType = match[1];
            imageBase64 = match[2];
        } else {
            // External URL — fetch it
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) {
                return NextResponse.json({ error: 'Failed to fetch image' }, { status: 400 });
            }
            const buf = Buffer.from(await imgRes.arrayBuffer());
            imageBase64 = buf.toString('base64');
            const ct = imgRes.headers.get('content-type');
            if (ct) mimeType = ct;
        }

        // Build Gemini prompt
        const contextLine = productContext
            ? `\nAdditional product context from the seller: ${productContext}\n`
            : '';

        const prompt = `You are an expert Etsy SEO specialist. Analyze this product mockup image and generate an optimized Etsy listing.
${contextLine}
STRICT RULES:
1. TITLE: Max 140 characters. Front-load the most important keywords. Include: product type, design style, occasion/use, and a unique differentiator. Do NOT use all caps. Use proper capitalization.
2. DESCRIPTION: Write a compelling product description:
   - Opening hook (2-3 engaging sentences)
   - "✦ FEATURES" section with bullet points
   - "✦ DETAILS" section (materials, quality, sizing)
   - "✦ PERFECT FOR" section (occasions, gift ideas)
   - "✦ HOW TO ORDER" section (brief instructions)
   - Natural keyword integration throughout
   - Max 10000 characters total
3. TAGS: Exactly 13 tags. Each tag max 20 characters. Include a mix of:
   - High-volume search terms
   - Long-tail niche keywords
   - Seasonal/trending terms if applicable
   - Product-type specific terms

Respond ONLY with valid JSON, no markdown fences:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11", "tag12", "tag13"]
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType, data: imageBase64 } },
                    ],
                }],
                generationConfig: {
                    responseModalities: ['TEXT'],
                    temperature: 0.7,
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[generate-seo] Gemini error:', errorText);
            return NextResponse.json({ error: `AI error (${response.status})` }, { status: 502 });
        }

        const data = await response.json();
        const textPart = data?.candidates?.[0]?.content?.parts?.find(
            (p: Record<string, unknown>) => typeof p.text === 'string'
        );
        if (!textPart?.text) {
            return NextResponse.json({ error: 'No text response from AI' }, { status: 502 });
        }

        // Parse JSON from response (may be wrapped in markdown fences)
        let jsonText = textPart.text.trim();
        const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonText = fenceMatch[1].trim();

        const parsed = JSON.parse(jsonText);

        // Validate & enforce Etsy limits
        const title = String(parsed.title || '').slice(0, 140);
        const description = String(parsed.description || '').slice(0, 10000);
        const tags: string[] = (Array.isArray(parsed.tags) ? parsed.tags : [])
            .slice(0, 13)
            .map((t: unknown) => String(t).slice(0, 20));

        return NextResponse.json({ title, description, tags });
    } catch (err) {
        console.error('[generate-seo] Error:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
