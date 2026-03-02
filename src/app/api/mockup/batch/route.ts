import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { v4 as uuidv4 } from 'uuid';
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
    };
    overlay?: {
        x: number; y: number; width: number; height: number; rotation?: number;
    };
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

        const results = [];

        for (const item of items) {
            try {
                const mockupBuffer = await resolveToBuffer(item.mockupImagePath);
                const designBuffer = await resolveToBuffer(item.designImagePath);

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
                    // Overlay mode: draw design at overlay position, then warp the composed result into mask
                    const ov = item.overlay;
                    const overlayCanvas = createCanvas(mockupImg.width, mockupImg.height);
                    const ovCtx = overlayCanvas.getContext('2d');

                    // Draw design at overlay position/size
                    ovCtx.save();
                    if (ov.rotation) {
                        const cx = ov.x + ov.width / 2;
                        const cy = ov.y + ov.height / 2;
                        ovCtx.translate(cx, cy);
                        ovCtx.rotate((ov.rotation * Math.PI) / 180);
                        ovCtx.drawImage(designImg, -ov.width / 2, -ov.height / 2, ov.width, ov.height);
                    } else {
                        ovCtx.drawImage(designImg, ov.x, ov.y, ov.width, ov.height);
                    }
                    ovCtx.restore();

                    // Load the overlay canvas as an image for perspective warp
                    const overlayBuffer = overlayCanvas.toBuffer('image/png');
                    const overlayImg = await loadImage(overlayBuffer);
                    drawPerspective(tmpCtx, overlayImg, quad, mask.edgeCurves, 16, 'fill');
                } else {
                    drawPerspective(tmpCtx, designImg, quad, mask.edgeCurves, 16, fitMode);
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
                    templateName: item.templateName,
                    variationName: item.variationName,
                });
            } catch (err) {
                console.error(`Batch item failed:`, err);
                results.push({
                    id: uuidv4(),
                    imageUrl: '',
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
