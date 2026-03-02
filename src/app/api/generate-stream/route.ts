import { NextRequest, NextResponse } from 'next/server';
import { createAIProvider } from '@/lib/ai-provider';
import { DEFAULT_STYLE_PRESETS, buildVariationPrompt } from '@/lib/prompt-engine';
import { v4 as uuidv4 } from 'uuid';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { parallelLimit } from '@/lib/concurrency';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    try {
        const body = await request.json();
        const { sourceImageUrl, sourceImageUrls, styles, additionalPrompt, imageSize, aspectRatio } = body;

        // Normalize to array: [{id, url}]
        let sources: { id: string; url: string }[];
        if (sourceImageUrls && Array.isArray(sourceImageUrls) && sourceImageUrls.length > 0) {
            sources = sourceImageUrls;
        } else if (sourceImageUrl) {
            // Backward compat: single URL
            sources = [{ id: 'single', url: sourceImageUrl }];
        } else {
            return NextResponse.json({ error: 'No source image provided' }, { status: 400 });
        }

        const provider = createAIProvider(process.env.AI_PROVIDER || 'mock');

        // Pre-fetch all source images
        const sourceBuffers = new Map<string, string>();
        for (const src of sources) {
            const buffer = await resolveToBuffer(src.url);
            sourceBuffers.set(src.id, buffer.toString('base64'));
        }

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

        // Build tasks: source × style
        const tasks = sources.flatMap((src) =>
            stylePresets.map((style) => ({ sourceId: src.id, style }))
        );

        // SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                await parallelLimit(
                    tasks,
                    async ({ sourceId, style }) => {
                        const variationId = uuidv4();
                        try {
                            const sourceBase64 = sourceBuffers.get(sourceId)!;
                            const basePrompt = style.id.startsWith('custom-') ? '' : (additionalPrompt || '');
                            const prompt = buildVariationPrompt(basePrompt, style);
                            console.log(`[generate-stream] Source: ${sourceId} | Style: ${style.id} | Prompt: ${prompt.slice(0, 200)}...`);
                            const resultBase64 = await provider.generateVariation(sourceBase64, prompt, {
                                imageSize: imageSize || '2K',
                                aspectRatio: aspectRatio || '1:1',
                            });

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
                                sourceDesignId: sourceId,
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
                                sourceDesignId: sourceId,
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
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
    }
}
