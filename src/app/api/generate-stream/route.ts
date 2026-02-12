import { NextRequest } from 'next/server';
import { createAIProvider } from '@/lib/ai-provider';
import { DEFAULT_STYLE_PRESETS, buildVariationPrompt } from '@/lib/prompt-engine';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { resolvePublicPath } from '@/lib/resolve-path';
import { ensureStorageDir } from '@/lib/storage';
import { parallelLimit } from '@/lib/concurrency';

export async function POST(request: NextRequest) {
    try {
        const OUTPUT_DIR = await ensureStorageDir('variations');

        const body = await request.json();
        const { sourceImageUrl, styles, additionalPrompt } = body;

        if (!sourceImageUrl) {
            return Response.json({ error: 'No source image path' }, { status: 400 });
        }

        const provider = createAIProvider(process.env.AI_PROVIDER || 'mock');

        const sourcePath = resolvePublicPath(sourceImageUrl);
        if (!sourcePath) {
            return Response.json({ error: 'Invalid image path' }, { status: 400 });
        }
        const sourceBuffer = await readFile(sourcePath);
        const sourceBase64 = sourceBuffer.toString('base64');

        // Determine styles
        let stylePresets: import('@/types').StylePreset[];
        if (styles && styles.length > 0) {
            stylePresets = styles.map((s: { id: string; name: string; prompt: string; icon?: string }) => {
                const preset = DEFAULT_STYLE_PRESETS.find((p) => p.id === s.id);
                return preset || { id: s.id, name: s.name || s.id, prompt: s.prompt || s.name || s.id, icon: s.icon || '' };
            });
        } else {
            stylePresets = DEFAULT_STYLE_PRESETS.slice(0, 10);
        }

        // SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                await parallelLimit(
                    stylePresets,
                    async (style) => {
                        const variationId = uuidv4();
                        try {
                            const prompt = buildVariationPrompt(additionalPrompt || '', style);
                            const resultBase64 = await provider.generateVariation(sourceBase64, prompt);

                            const isSvg = resultBase64.startsWith('PHN2Zy');
                            const ext = isSvg ? 'svg' : 'png';
                            const filename = `${variationId}.${ext}`;
                            const filepath = path.join(OUTPUT_DIR, filename);

                            const buffer = Buffer.from(resultBase64, 'base64');
                            await writeFile(filepath, buffer);

                            const variation = {
                                id: variationId,
                                styleId: style.id,
                                styleName: style.name,
                                imageUrl: `/api/files/variations/${filename}`,
                                selected: false,
                                loading: false,
                            };

                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(variation)}\n\n`));
                            return variation;
                        } catch (err) {
                            const variation = {
                                id: variationId,
                                styleId: style.id,
                                styleName: style.name,
                                imageUrl: '',
                                selected: false,
                                loading: false,
                                error: err instanceof Error ? err.message : 'Generation failed',
                            };
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(variation)}\n\n`));
                            return variation;
                        }
                    },
                    3, // concurrency limit
                );

                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Generate stream error:', error);
        return Response.json({ error: 'Generation failed' }, { status: 500 });
    }
}
