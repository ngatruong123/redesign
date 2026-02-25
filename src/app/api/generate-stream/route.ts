import { NextRequest } from 'next/server';
import { createAIProvider } from '@/lib/ai-provider';
import { DEFAULT_STYLE_PRESETS, buildVariationPrompt } from '@/lib/prompt-engine';
import { v4 as uuidv4 } from 'uuid';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { parallelLimit } from '@/lib/concurrency';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sourceImageUrl, styles, additionalPrompt } = body;

        if (!sourceImageUrl) {
            return Response.json({ error: 'No source image path' }, { status: 400 });
        }

        const provider = createAIProvider(process.env.AI_PROVIDER || 'mock');

        const sourceBuffer = await resolveToBuffer(sourceImageUrl);
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
                            // For custom prompt-only styles, don't pass additionalPrompt (it's already in style.prompt)
                            const basePrompt = style.id.startsWith('custom-') ? '' : (additionalPrompt || '');
                            const prompt = buildVariationPrompt(basePrompt, style);
                            const resultBase64 = await provider.generateVariation(sourceBase64, prompt);

                            const isSvg = resultBase64.startsWith('PHN2Zy');
                            const ext = isSvg ? 'svg' : 'png';
                            const filename = `${variationId}.${ext}`;

                            const buffer = Buffer.from(resultBase64, 'base64');
                            const { url } = await storeFile('variations', filename, buffer);

                            const variation = {
                                id: variationId,
                                styleId: style.id,
                                styleName: style.name,
                                imageUrl: url,
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
