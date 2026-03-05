import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { resolveToBuffer, storeFile } from '@/lib/blob-storage';
import { drawPerspective, rectToQuad, type FitMode } from '@/lib/perspective';
import { requireAuth } from '@/lib/api-auth';

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
}

const VALID_BLEND_MODES = ['normal', 'multiply', 'overlay', 'screen', 'soft-light'] as const;

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

        const results = [];

        for (const item of items) {
            try {
                let mockupBuffer = await resolveToBuffer(item.mockupImagePath);
                const designBuffer = await resolveToBuffer(item.designImagePath);

                // Apply background blur if specified
                const bgBlur = item.mask.backgroundBlur;
                if (bgBlur && bgBlur > 0) {
                    // sharp.blur sigma must be >= 0.3; use value directly as sigma
                    mockupBuffer = await sharp(mockupBuffer).blur(Math.max(0.3, bgBlur)).toBuffer();
                }

                const mockupImg = await loadImage(mockupBuffer);
                const designImg = await loadImage(designBuffer);

                const canvas = createCanvas(mockupImg.width, mockupImg.height);
                const ctx = canvas.getContext('2d');

                // 1. Draw mockup background
                ctx.drawImage(mockupImg, 0, 0);

                // 2. Determine quad
                const mask = item.mask;
                const mode = mask.mode || 'rect';
                let quad: [Point, Point, Point, Point];

                if (mode === 'quad' && mask.quad) {
                    quad = mask.quad;
                } else {
                    quad = rectToQuad(
                        mask.x, mask.y, mask.width, mask.height,
                        mask.rotation || 0,
                    );
                }

                const blendMode = mask.blendMode && VALID_BLEND_MODES.includes(mask.blendMode as typeof VALID_BLEND_MODES[number])
                    ? mask.blendMode
                    : 'normal';
                const opacity = typeof mask.opacity === 'number' ? mask.opacity / 100 : 1;

                // 3. Render warped design onto a temp canvas
                const tmpCanvas = createCanvas(mockupImg.width, mockupImg.height);
                const tmpCtx = tmpCanvas.getContext('2d');
                const fitMode: FitMode = mask.fitMode === 'fill' ? 'fill' : 'contain';

                if (item.overlay) {
                    // Overlay mode: draw design directly at overlay position/size (no perspective warp)
                    const ov = item.overlay;

                    // Calculate crop insets
                    const cropT = (ov.cropTop ?? 0) / 100;
                    const cropR = (ov.cropRight ?? 0) / 100;
                    const cropB = (ov.cropBottom ?? 0) / 100;
                    const cropL = (ov.cropLeft ?? 0) / 100;

                    // Source rect in the design image (crop applied)
                    const sx = cropL * designImg.width;
                    const sy = cropT * designImg.height;
                    const sw = designImg.width * (1 - cropL - cropR);
                    const sh = designImg.height * (1 - cropT - cropB);

                    // Destination rect on the mockup (crop adjusts visible area)
                    const dx = ov.x + ov.width * cropL;
                    const dy = ov.y + ov.height * cropT;
                    const dw = ov.width * (1 - cropL - cropR);
                    const dh = ov.height * (1 - cropT - cropB);

                    // Draw design directly onto tmp canvas at overlay position
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
                    drawPerspective(tmpCtx, designImg, quad, mask.edgeCurves, 32, fitMode);
                }

                // 4. Set blend mode and opacity
                const compositeMap: Record<string, GlobalCompositeOperation> = {
                    'normal': 'source-over',
                    'multiply': 'multiply',
                    'overlay': 'overlay',
                    'screen': 'screen',
                    'soft-light': 'soft-light',
                };
                ctx.globalCompositeOperation = compositeMap[blendMode] || 'source-over';
                ctx.globalAlpha = opacity;

                // 5. Draw with shadow applied to the design shape
                if (mask.shadow && mask.shadow.blur > 0) {
                    ctx.shadowBlur = mask.shadow.blur;
                    ctx.shadowColor = mask.shadow.color || 'rgba(0,0,0,0.5)';
                }

                ctx.drawImage(tmpCanvas, 0, 0);

                // Reset
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;

                const resultBuffer = canvas.toBuffer('image/png');
                const id = uuidv4();

                // Store to file and return URL path
                const filename = `${id}.png`;
                const { url } = await storeFile('mockups', filename, Buffer.from(resultBuffer));

                results.push({
                    id,
                    imageUrl: url,
                    templateId: item.templateId,
                    variationId: item.variationId,
                    templateName: item.templateName,
                    variationName: item.variationName,
                });
            } catch (err) {
                console.error(`Batch item failed:`, err);
                results.push({
                    id: uuidv4(),
                    imageUrl: '',
                    templateId: item.templateId,
                    variationId: item.variationId,
                    templateName: item.templateName,
                    variationName: item.variationName,
                    error: err instanceof Error ? err.message : 'Failed',
                });
            }
        }

        return NextResponse.json({
            results,
        });
    } catch (error) {
        console.error('Batch error:', error);
        return NextResponse.json({ error: 'Batch processing failed' }, { status: 500 });
    }
}
