import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';
import { hexToRgb, deltaE } from '@/lib/color-science';
import { composeBg } from '@/lib/bg-compose';
import { removeBgSchema } from '@/lib/validators';

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    try {
        const body = await request.json();
        const parsed = removeBgSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
        }
        const { imageUrl, mode = 'transparent', bgColor, gradientId, customBgUrl, edgeSmooth = false, keyColor, tolerance: toleranceRaw, softEdge: softEdgeRaw } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: 'No image URL' }, { status: 400 });
        }

        let fileBuffer: Buffer;
        try {
            fileBuffer = await resolveToBuffer(imageUrl);
        } catch {
            return NextResponse.json({ error: 'Không tìm thấy ảnh gốc. Vui lòng tải lại ảnh.' }, { status: 404 });
        }

        const meta = await sharp(fileBuffer).metadata();
        const imgW = meta.width || 1024;
        const imgH = meta.height || 1024;

        // Color key mode: perceptual color removal using CIE Lab
        if (mode === 'colorkey') {
            const target = hexToRgb(keyColor || '#00ff00');
            const tol = Math.max(0, Math.min(100, Number(toleranceRaw) || 30));
            const soft = Math.max(0, Math.min(50, Number(softEdgeRaw) || 15));
            const { data, info } = await sharp(fileBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const px = new Uint8Array(data.buffer, data.byteOffset, data.length);
            const th = tol * 0.5, sz = soft * 0.5;
            for (let i = 0; i < px.length; i += 4) {
                const d = deltaE(px[i], px[i + 1], px[i + 2], target.r, target.g, target.b);
                if (d <= th) px[i + 3] = 0;
                else if (sz > 0 && d <= th + sz) {
                    const t = (d - th) / sz;
                    px[i + 3] = Math.min(px[i + 3], Math.round(t * t * (3 - 2 * t) * px[i + 3]));
                }
            }
            let out = await sharp(Buffer.from(px.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
            if (edgeSmooth) out = await sharp(out).blur(1.5).png().toBuffer();
            const { url } = await storeFile('variations', `${uuidv4()}.png`, out);
            return NextResponse.json({ url });
        }

        // Background removal via @imgly
        let subjectBuffer: Buffer;
        try {
            const { removeBackground } = await import('@imgly/background-removal-node');
            const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' });
            const resultBlob = await removeBackground(blob, { output: { format: 'image/png' as const, quality: 0.9 } });
            subjectBuffer = Buffer.from(await resultBlob.arrayBuffer());
            if (edgeSmooth) subjectBuffer = await sharp(subjectBuffer).blur(1.5).png().toBuffer();
        } catch (err) {
            console.error('Background removal error:', err);
            return NextResponse.json({ error: 'Background removal failed.' }, { status: 500 });
        }

        // Compose final output
        const outputBuffer = await composeBg(subjectBuffer, fileBuffer, imgW, imgH, mode, { bgColor, gradientId, customBgUrl });
        const { url } = await storeFile('variations', `${uuidv4()}.png`, outputBuffer);
        return NextResponse.json({ url });
    } catch (error) {
        console.error('Remove BG error:', error);
        return NextResponse.json({ error: 'Remove BG failed' }, { status: 500 });
    }
}
