import { NextRequest, NextResponse } from 'next/server';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { drawPerspective, rectToQuad, type FitMode } from '@/lib/perspective';

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
    templateName: string;
    variationName: string;
}

const VALID_BLEND_MODES = ['normal', 'multiply', 'overlay', 'screen', 'soft-light'] as const;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { items } = body as { items: BatchItem[] };

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items to process' }, { status: 400 });
        }

        const zip = new JSZip();
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
                drawPerspective(tmpCtx, designImg, quad, mask.edgeCurves, 16, fitMode);

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
                const filename = `${id}.png`;
                const { url } = await storeFile('mockups', filename, resultBuffer);

                const zipFilename = `${item.templateName}_${item.variationName}_${id}.png`.replace(/[^a-zA-Z0-9._-]/g, '_');
                zip.file(zipFilename, resultBuffer);

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

        // Generate zip
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        const zipId = uuidv4();
        const { url: zipUrl } = await storeFile('mockups', `${zipId}.zip`, zipBuffer);

        return NextResponse.json({
            results,
            zipUrl,
        });
    } catch (error) {
        console.error('Batch error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        const stack = error instanceof Error ? error.stack : '';
        return NextResponse.json({ error: 'Batch processing failed', message, stack }, { status: 500 });
    }
}
