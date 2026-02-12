import { NextRequest, NextResponse } from 'next/server';
import { createAIProvider } from '@/lib/ai-provider';
import { DEFAULT_STYLE_PRESETS, buildVariationPrompt } from '@/lib/prompt-engine';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { resolvePublicPath } from '@/lib/resolve-path';
import { ensureStorageDir } from '@/lib/storage';

export async function POST(request: NextRequest) {
    try {
        const OUTPUT_DIR = await ensureStorageDir('variations');

        const body = await request.json();
        const { sourceImageUrl, sourceImagePath, styles, additionalPrompt, count } = body;

        // Support both field names
        const imagePath = sourceImageUrl || sourceImagePath;
        if (!imagePath) {
            return NextResponse.json({ error: 'No source image path' }, { status: 400 });
        }

        const provider = createAIProvider(process.env.AI_PROVIDER || 'mock');

        // Read source image
        const sourcePath = resolvePublicPath(imagePath);
        if (!sourcePath) {
            return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
        }
        const sourceBuffer = await readFile(sourcePath);
        const sourceBase64 = sourceBuffer.toString('base64');

        // Determine which styles to generate
        let stylePresets;
        if (styles && styles.length > 0) {
            // Prefer rich prompts from DEFAULT_STYLE_PRESETS when available
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

                // Determine if result is SVG or binary image
                const isSvg = resultBase64.startsWith('PHN2Zy'); // base64 of "<svg"
                const ext = isSvg ? 'svg' : 'png';
                const filename = `${variationId}.${ext}`;
                const filepath = path.join(OUTPUT_DIR, filename);

                const buffer = Buffer.from(resultBase64, 'base64');
                await writeFile(filepath, buffer);

                results.push({
                    id: variationId,
                    styleId: style.id,
                    styleName: style.name,
                    imageUrl: `/api/files/variations/${filename}`,
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
