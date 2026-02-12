import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { resolvePublicPath } from '@/lib/resolve-path';
import { ensureStorageDir } from '@/lib/storage';

interface BatchItem {
    mockupImagePath: string;
    designImagePath: string;
    mask: { x: number; y: number; width: number; height: number; rotation?: number };
    templateName: string;
    variationName: string;
}

export async function POST(request: NextRequest) {
    try {
        const MOCKUP_OUTPUT_DIR = await ensureStorageDir('mockups');

        const body = await request.json();
        const { items } = body as { items: BatchItem[] };

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items to process' }, { status: 400 });
        }

        const zip = new JSZip();
        const results = [];

        for (const item of items) {
            try {
                const mockupPath = resolvePublicPath(item.mockupImagePath);
                const designPath = resolvePublicPath(item.designImagePath);
                if (!mockupPath || !designPath) throw new Error('Invalid image path');

                const mockupBuffer = await readFile(mockupPath);
                const designBuffer = await readFile(designPath);

                const rotation = item.mask.rotation || 0;
                let resizedDesign = await sharp(designBuffer)
                    .resize(Math.round(item.mask.width), Math.round(item.mask.height), {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                    })
                    .png()
                    .toBuffer();

                if (rotation !== 0) {
                    resizedDesign = await sharp(resizedDesign)
                        .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .png()
                        .toBuffer();
                }

                const result = await sharp(mockupBuffer)
                    .composite([{
                        input: resizedDesign,
                        left: Math.round(item.mask.x),
                        top: Math.round(item.mask.y),
                    }])
                    .png()
                    .toBuffer();

                const id = uuidv4();
                const filename = `${id}.png`;
                const filepath = path.join(MOCKUP_OUTPUT_DIR, filename);
                await writeFile(filepath, result);

                const zipFilename = `${item.templateName}_${item.variationName}.png`.replace(/\s+/g, '_');
                zip.file(zipFilename, result);

                results.push({
                    id,
                    imageUrl: `/api/files/mockups/${filename}`,
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
        const zipPath = path.join(MOCKUP_OUTPUT_DIR, `${zipId}.zip`);
        await writeFile(zipPath, zipBuffer);

        return NextResponse.json({
            results,
            zipUrl: `/api/files/mockups/${zipId}.zip`,
        });
    } catch (error) {
        console.error('Batch error:', error);
        return NextResponse.json({ error: 'Batch processing failed' }, { status: 500 });
    }
}
