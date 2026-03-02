import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { resolveToBuffer, storeFile } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    try {
        const body = await request.json();
        const { mockupImagePath, designImagePath, mask } = body;

        if (!mockupImagePath || !designImagePath || !mask) {
            return NextResponse.json(
                { error: 'Missing mockupImagePath, designImagePath, or mask' },
                { status: 400 }
            );
        }

        const mockupBuffer = await resolveToBuffer(mockupImagePath);
        const designBuffer = await resolveToBuffer(designImagePath);

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
        const { url } = await storeFile('mockups', filename, result);

        return NextResponse.json({
            id,
            imageUrl: url,
        });
    } catch (error) {
        console.error('Mockup error:', error);
        return NextResponse.json(
            { error: 'Mockup generation failed' },
            { status: 500 }
        );
    }
}
