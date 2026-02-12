import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { resolvePublicPath } from '@/lib/resolve-path';

const MOCKUP_OUTPUT_DIR = path.join(process.cwd(), 'public', 'mockups');

export async function POST(request: NextRequest) {
    try {
        await mkdir(MOCKUP_OUTPUT_DIR, { recursive: true });

        const body = await request.json();
        const { mockupImagePath, designImagePath, mask } = body;

        if (!mockupImagePath || !designImagePath || !mask) {
            return NextResponse.json(
                { error: 'Missing mockupImagePath, designImagePath, or mask' },
                { status: 400 }
            );
        }

        const mockupPath = resolvePublicPath(mockupImagePath);
        const designPath = resolvePublicPath(designImagePath);
        if (!mockupPath || !designPath) {
            return NextResponse.json({ error: 'Invalid image path' }, { status: 400 });
        }

        const mockupBuffer = await readFile(mockupPath);
        const designBuffer = await readFile(designPath);

        // Resize design to fit mask area
        const resizedDesign = await sharp(designBuffer)
            .resize(Math.round(mask.width), Math.round(mask.height), {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer();

        // Composite design onto mockup
        const result = await sharp(mockupBuffer)
            .composite([
                {
                    input: resizedDesign,
                    left: Math.round(mask.x),
                    top: Math.round(mask.y),
                },
            ])
            .png()
            .toBuffer();

        const id = uuidv4();
        const filename = `${id}.png`;
        const filepath = path.join(MOCKUP_OUTPUT_DIR, filename);
        await writeFile(filepath, result);

        return NextResponse.json({
            id,
            imageUrl: `/api/files/mockups/${filename}`,
        });
    } catch (error) {
        console.error('Mockup error:', error);
        return NextResponse.json(
            { error: 'Mockup generation failed' },
            { status: 500 }
        );
    }
}
