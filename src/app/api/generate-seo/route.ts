import { NextRequest, NextResponse } from 'next/server';
import { resolveToBuffer } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { generateSeoSchema } from '@/lib/validators';
import { getUserApiKey } from '@/lib/get-user-api-key';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
    const rl = checkRateLimit('ai:' + ip, 10, 60_000);
    if (!rl.allowed) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } });
    }
    try {
        const body = await req.json();
        const validated = generateSeoSchema.safeParse(body);
        if (!validated.success) {
            return NextResponse.json({ error: validated.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
        }
        const { imageUrl, productContext } = validated.data;

        const userApiKey = await getUserApiKey('gemini_api_key');
        const apiKey = userApiKey || process.env.GEMINI_API_KEY;
        const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image-preview';

        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
        }

        // Load image as base64
        const buffer = await resolveToBuffer(imageUrl);
        const imageBase64 = buffer.toString('base64');
        let mimeType = 'image/png';
        if (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (imageUrl.endsWith('.webp')) mimeType = 'image/webp';

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
                    responseMimeType: 'application/json',
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

        let parsed: { title?: string; description?: string; tags?: unknown[] };
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            // Gemini sometimes produces invalid JSON (unescaped newlines, special chars).
            // Extract fields with regex as fallback.
            const titleMatch = jsonText.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            const tagsMatch = jsonText.match(/"tags"\s*:\s*\[([\s\S]*?)\]/);
            // For description, find the start and scan for the closing quote
            const descStart = jsonText.indexOf('"description"');
            let descValue = '';
            if (descStart !== -1) {
                const quoteStart = jsonText.indexOf('"', jsonText.indexOf(':', descStart) + 1);
                if (quoteStart !== -1) {
                    // Walk forward to find unescaped closing quote followed by , or }
                    let i = quoteStart + 1;
                    let acc = '';
                    while (i < jsonText.length) {
                        if (jsonText[i] === '\\' && i + 1 < jsonText.length) {
                            acc += jsonText[i] + jsonText[i + 1];
                            i += 2;
                        } else if (jsonText[i] === '"') {
                            break;
                        } else {
                            acc += jsonText[i];
                            i++;
                        }
                    }
                    descValue = acc.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                }
            }

            parsed = {
                title: titleMatch?.[1]?.replace(/\\n/g, '\n').replace(/\\"/g, '"') || '',
                description: descValue,
                tags: tagsMatch?.[1]
                    ? (tagsMatch[1].match(/"((?:[^"\\]|\\.)*)"/g) || []).map((s: string) => s.slice(1, -1))
                    : [],
            };
        }

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
