import { NextRequest, NextResponse } from 'next/server';
import { createAIProvider } from '@/lib/ai-provider';
import { DEFAULT_STYLE_PRESETS, buildVariationPrompt } from '@/lib/prompt-engine';
import { v4 as uuidv4 } from 'uuid';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    try {
        const body = await request.json();
        const { sourceImageUrl, sourceImagePath, styles, additionalPrompt, count } = body;

        // Support both field names
        const imagePath = sourceImageUrl || sourceImagePath;
        if (!imagePath) {
            return NextResponse.json({ error: 'No source image path' }, { status: 400 });
        }

        const provider = createAIProvider(process.env.AI_PROVIDER || 'mock');

        // Read source image
        const sourceBuffer = await resolveToBuffer(imagePath);
        const sourceBase64 = sourceBuffer.toString('base64');

        // Determine which styles to generate
        let stylePresets;
        if (styles && styles.length > 0) {
            stylePresets = styles.map((s: { id: string; name: string; prompt: string }) => {
                const preset = DEFAULT_STYLE_PRESETS.find((p) => p.id === s.id);
                return preset || { id: s.id, name: s.name || s.id, prompt: s.prompt || s.name || s.id };
            });
        } else {
            const requestedCount = Math.min(Math.max(count || 10, 1), 20);
            if (requestedCount <= DEFAULT_STYLE_PRESETS.length) {
                stylePresets = DEFAULT_STYLE_PRESETS.slice(0, requestedCount);
            } else {
                stylePresets = [
                    ...DEFAULT_STYLE_PRESETS,
                    ...Array.from({ length: requestedCount - DEFAULT_STYLE_PRESETS.length }, (_, i) =>
                        DEFAULT_STYLE_PRESETS[i % DEFAULT_STYLE_PRESETS.length]
                    ),
                ];
            }
        }

        const results = [];

        // Generate variations sequentially to avoid rate limits
        for (const style of stylePresets) {
            const variationId = uuidv4();

            try {
                const prompt = buildVariationPrompt(additionalPrompt || '', style);
                const resultBase64 = await provider.generateVariation(sourceBase64, prompt);

                const isSvg = resultBase64.startsWith('PHN2Zy');
                const ext = isSvg ? 'svg' : 'png';
                const filename = `${variationId}.${ext}`;

                const buffer = Buffer.from(resultBase64, 'base64');
                const { url } = await storeFile('variations', filename, buffer);

                results.push({
                    id: variationId,
                    styleId: style.id,
                    styleName: style.name,
                    imageUrl: url,
                    selected: false,
                    loading: false,
                });
            } catch (err) {
                console.error(`Failed to generate ${style.name}:`, err);
                results.push({
                    id: variationId,
                    styleId: style.id,
                    styleName: style.name,
                    imageUrl: '',
                    selected: false,
                    loading: false,
                    error: err instanceof Error ? err.message : 'Generation failed',
                });
            }
        }

        return NextResponse.json({ variations: results });
    } catch (error) {
        console.error('Generate error:', error);
        return NextResponse.json(
            { error: 'Generation failed' },
            { status: 500 }
        );
    }
}
