import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { resolveToBuffer, storeFile } from '@/lib/blob-storage';
import { drawPerspective, rectToQuad, type FitMode } from '@/lib/perspective';
import { requireAuth } from '@/lib/api-auth';
import { parallelLimit } from '@/lib/concurrency';

interface Point { x: number; y: number; }

interface BatchItem {
    mockupImagePath: string;
    designImagePath: string;
    mask: {
        x: number; y: number; width: number; height: number; rotation?: number;
        mode?: 'rect' | 'quad';
        quad?: [Point, Point, Point, Point];
        edgeCurves?: [Point, Point, Point, Point];
        fitMode?: FitMode;
        blendMode?: string;
        opacity?: number;
        shadow?: { blur: number; color: string; };
        backgroundBlur?: number;
    };
    overlay?: {
        x: number; y: number; width: number; height: number; rotation?: number;
        cropTop?: number; cropRight?: number; cropBottom?: number; cropLeft?: number;
    };
    templateId?: string;
    variationId?: string;
    templateName: string;
    variationName: string;
    sourceDesignId?: string;
    sourceDesignName?: string;
}

const VALID_BLEND_MODES = ['normal', 'multiply', 'overlay', 'screen', 'soft-light'] as const;

async function processItem(item: BatchItem) {
    let mockupBuffer = await resolveToBuffer(item.mockupImagePath);
    const designBuffer = await resolveToBuffer(item.designImagePath);

    const bgBlur = item.mask.backgroundBlur;
    if (bgBlur && bgBlur > 0) {
        mockupBuffer = await sharp(mockupBuffer).blur(Math.max(0.3, bgBlur)).toBuffer();
    }

    const mockupImg = await loadImage(mockupBuffer);
    const designImg = await loadImage(designBuffer);

    const canvas = createCanvas(mockupImg.width, mockupImg.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(mockupImg, 0, 0);

    const mask = item.mask;
    const mode = mask.mode || 'rect';
    let quad: [Point, Point, Point, Point];

    if (mode === 'quad' && mask.quad) {
        quad = mask.quad;
    } else {
        quad = rectToQuad(mask.x, mask.y, mask.width, mask.height, mask.rotation || 0);
    }

    const blendMode = mask.blendMode && VALID_BLEND_MODES.includes(mask.blendMode as typeof VALID_BLEND_MODES[number])
        ? mask.blendMode : 'normal';
    const opacity = typeof mask.opacity === 'number' ? mask.opacity / 100 : 1;

    const fitMode: FitMode = mask.fitMode === 'fill' ? 'fill' : 'contain';
    const useSupersample = !item.overlay;
    const SS = useSupersample ? 2 : 1;

    const tmpCanvas = createCanvas(mockupImg.width * SS, mockupImg.height * SS);
    const tmpCtx = tmpCanvas.getContext('2d');

    if (item.overlay) {
        const ov = item.overlay;
        const cropT = (ov.cropTop ?? 0) / 100;
        const cropR = (ov.cropRight ?? 0) / 100;
        const cropB = (ov.cropBottom ?? 0) / 100;
        const cropL = (ov.cropLeft ?? 0) / 100;

        const sx = cropL * designImg.width;
        const sy = cropT * designImg.height;
        const sw = designImg.width * (1 - cropL - cropR);
        const sh = designImg.height * (1 - cropT - cropB);

        const dx = ov.x + ov.width * cropL;
        const dy = ov.y + ov.height * cropT;
        const dw = ov.width * (1 - cropL - cropR);
        const dh = ov.height * (1 - cropT - cropB);

        tmpCtx.save();
        if (ov.rotation) {
            const cx = ov.x + ov.width / 2;
            const cy = ov.y + ov.height / 2;
            tmpCtx.translate(cx, cy);
            tmpCtx.rotate((ov.rotation * Math.PI) / 180);
            tmpCtx.drawImage(designImg, sx, sy, sw, sh, dx - cx, dy - cy, dw, dh);
        } else {
            tmpCtx.drawImage(designImg, sx, sy, sw, sh, dx, dy, dw, dh);
        }
        tmpCtx.restore();
    } else {
        const ssQuad = quad.map(p => ({ x: p.x * SS, y: p.y * SS })) as [Point, Point, Point, Point];
        const ssEdgeCurves = mask.edgeCurves
            ? mask.edgeCurves.map(p => ({ x: p.x * SS, y: p.y * SS })) as [Point, Point, Point, Point]
            : undefined;
        drawPerspective(tmpCtx, designImg, ssQuad, ssEdgeCurves, 64, fitMode);
    }

    const compositeMap: Record<string, GlobalCompositeOperation> = {
        'normal': 'source-over', 'multiply': 'multiply', 'overlay': 'overlay',
        'screen': 'screen', 'soft-light': 'soft-light',
    };
    ctx.globalCompositeOperation = compositeMap[blendMode] || 'source-over';
    ctx.globalAlpha = opacity;

    const hasShadow = mask.shadow && mask.shadow.blur > 0;
    console.log('[batch] shadow:', JSON.stringify(mask.shadow), 'hasShadow:', hasShadow);

    if (hasShadow) {
        // Find bounding box of non-transparent pixels in tmpCanvas to apply shadow correctly
        const tmpData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
        const px = tmpData.data;
        let minX = tmpCanvas.width, minY = tmpCanvas.height, maxX = 0, maxY = 0;
        for (let y = 0; y < tmpCanvas.height; y++) {
            for (let x = 0; x < tmpCanvas.width; x++) {
                if (px[(y * tmpCanvas.width + x) * 4 + 3] > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX >= minX && maxY >= minY) {
            const pad = Math.ceil(mask.shadow!.blur * SS * 2);
            const cw = maxX - minX + 1;
            const ch = maxY - minY + 1;
            const cropCanvas = createCanvas(cw, ch);
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(tmpCanvas, minX, minY, cw, ch, 0, 0, cw, ch);

            // Draw shadow on a padded canvas
            const shadowCanvas = createCanvas(cw + pad * 2, ch + pad * 2);
            const shadowCtx = shadowCanvas.getContext('2d');
            shadowCtx.shadowBlur = mask.shadow!.blur * SS;
            shadowCtx.shadowColor = mask.shadow!.color || 'rgba(0,0,0,0.5)';
            shadowCtx.shadowOffsetX = 0;
            shadowCtx.shadowOffsetY = 0;
            shadowCtx.drawImage(cropCanvas, pad, pad);
            shadowCtx.shadowBlur = 0;
            shadowCtx.shadowColor = 'transparent';
            // Draw design on top of shadow
            shadowCtx.drawImage(cropCanvas, pad, pad);

            const destX = (minX - pad) / SS;
            const destY = (minY - pad) / SS;
            const destW = (cw + pad * 2) / SS;
            const destH = (ch + pad * 2) / SS;
            ctx.drawImage(shadowCanvas, 0, 0, shadowCanvas.width, shadowCanvas.height, destX, destY, destW, destH);
        }
    } else {
        ctx.drawImage(tmpCanvas, 0, 0, tmpCanvas.width, tmpCanvas.height, 0, 0, mockupImg.width, mockupImg.height);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const resultBuffer = canvas.toBuffer('image/png');
    const id = uuidv4();
    const filename = `${id}.png`;
    const { url } = await storeFile('mockups', filename, Buffer.from(resultBuffer));

    return {
        id,
        imageUrl: url,
        templateId: item.templateId,
        variationId: item.variationId,
        templateName: item.templateName,
        variationName: item.variationName,
        sourceDesignId: item.sourceDesignId,
        sourceDesignName: item.sourceDesignName,
    };
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    try {
        const body = await request.json();
        const { items } = body as { items: BatchItem[] };

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items to process' }, { status: 400 });
        }

        if (items.length > 50) {
            return NextResponse.json({ error: 'Too many items (max 50)' }, { status: 400 });
        }

        // Use SSE streaming to avoid timeout on large batches
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                await parallelLimit(
                    items,
                    async (item) => {
                        try {
                            const result = await processItem(item);
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
                            return result;
                        } catch (err) {
                            console.error(`Batch item failed:`, err);
                            const errorResult = {
                                id: uuidv4(),
                                imageUrl: '',
                                templateId: item.templateId,
                                variationId: item.variationId,
                                templateName: item.templateName,
                                variationName: item.variationName,
                                sourceDesignId: item.sourceDesignId,
                                sourceDesignName: item.sourceDesignName,
                                error: err instanceof Error ? err.message : 'Failed',
                            };
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResult)}\n\n`));
                            return errorResult;
                        }
                    },
                    // Lower concurrency for large batches to avoid OOM (each mockup uses ~2 large canvases)
                    items.length > 20 ? 1 : 2,
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
        console.error('Batch error:', error);
        return NextResponse.json({ error: 'Batch processing failed' }, { status: 500 });
    }
}
