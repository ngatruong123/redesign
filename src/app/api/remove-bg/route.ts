import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';
import { hexToRgb, deltaE } from '@/lib/color-science';
import { createGradientBuffer } from '@/lib/gradient';

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    try {
        const body = await request.json();
        const {
            imageUrl,
            mode = 'transparent',
            bgColor,
            gradientId,
            customBgUrl,
            edgeSmooth = false,
            keyColor,
            tolerance: toleranceRaw,
            softEdge: softEdgeRaw,
        } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: 'No image URL' }, { status: 400 });
        }

        // Read source image
        let fileBuffer: Buffer;
        try {
            fileBuffer = await resolveToBuffer(imageUrl);
        } catch {
            return NextResponse.json(
                { error: 'Không tìm thấy ảnh gốc. Vui lòng tải lại ảnh.' },
                { status: 404 },
            );
        }

        const sourceMeta = await sharp(fileBuffer).metadata();
        const imgWidth = sourceMeta.width || 1024;
        const imgHeight = sourceMeta.height || 1024;

        // ---- Color key mode: perceptual color removal using CIE Lab ----
        if (mode === 'colorkey') {
            const color = keyColor || '#00ff00';
            const tol = Math.max(0, Math.min(100, Number(toleranceRaw) || 30));
            const soft = Math.max(0, Math.min(50, Number(softEdgeRaw) || 15));
            const target = hexToRgb(color);

            const { data, info } = await sharp(fileBuffer)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);

            const threshold = tol * 0.5;
            const softZone = soft * 0.5;

            for (let i = 0; i < pixels.length; i += 4) {
                const dist = deltaE(pixels[i], pixels[i + 1], pixels[i + 2], target.r, target.g, target.b);

                if (dist <= threshold) {
                    pixels[i + 3] = 0;
                } else if (softZone > 0 && dist <= threshold + softZone) {
                    const t = (dist - threshold) / softZone;
                    const easedAlpha = t * t * (3 - 2 * t);
                    pixels[i + 3] = Math.min(pixels[i + 3], Math.round(easedAlpha * pixels[i + 3]));
                }
            }

            let outputBuffer = await sharp(Buffer.from(pixels.buffer), {
                raw: { width: info.width, height: info.height, channels: 4 },
            }).png().toBuffer();

            if (edgeSmooth) {
                outputBuffer = await sharp(outputBuffer).blur(1.5).png().toBuffer();
            }

            const resultId = uuidv4();
            const filename = `${resultId}.png`;
            const { url } = await storeFile('variations', filename, outputBuffer);
            return NextResponse.json({ url });
        }

        // ---- Use @imgly/background-removal to remove background ----
        let subjectBuffer: Buffer;
        try {
            const { removeBackground } = await import('@imgly/background-removal-node');
            const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' });
            const resultBlob = await removeBackground(blob, {
                output: { format: 'image/png' as const, quality: 0.9 },
            });
            const arrayBuffer = await resultBlob.arrayBuffer();
            subjectBuffer = Buffer.from(arrayBuffer);

            if (edgeSmooth) {
                subjectBuffer = await sharp(subjectBuffer)
                    .blur(1.5)
                    .png()
                    .toBuffer();
            }
        } catch (err) {
            console.error('Background removal error:', err);
            return NextResponse.json(
                { error: 'Background removal failed.' },
                { status: 500 },
            );
        }

        // ---- Compose final output based on mode ----
        let outputBuffer: Buffer;

        switch (mode) {
            case 'transparent': {
                outputBuffer = subjectBuffer;
                break;
            }

            case 'solid': {
                const color = bgColor || '#ffffff';
                const rgb = hexToRgb(color);
                const bgCanvas = await sharp({
                    create: {
                        width: imgWidth,
                        height: imgHeight,
                        channels: 4,
                        background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 255 },
                    },
                }).png().toBuffer();

                const resizedSubject = await sharp(subjectBuffer)
                    .resize(imgWidth, imgHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                outputBuffer = await sharp(bgCanvas)
                    .composite([{ input: resizedSubject, gravity: 'centre' }])
                    .png()
                    .toBuffer();
                break;
            }

            case 'blur': {
                const blurredBg = await sharp(fileBuffer)
                    .resize(imgWidth, imgHeight, { fit: 'cover' })
                    .blur(30)
                    .png()
                    .toBuffer();

                const resizedSubject = await sharp(subjectBuffer)
                    .resize(imgWidth, imgHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                outputBuffer = await sharp(blurredBg)
                    .composite([{ input: resizedSubject, gravity: 'centre' }])
                    .png()
                    .toBuffer();
                break;
            }

            case 'gradient': {
                const gId = gradientId || 'sunset';
                const gradBg = await createGradientBuffer(imgWidth, imgHeight, gId);

                const resizedSubject = await sharp(subjectBuffer)
                    .resize(imgWidth, imgHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                outputBuffer = await sharp(gradBg)
                    .composite([{ input: resizedSubject, gravity: 'centre' }])
                    .png()
                    .toBuffer();
                break;
            }

            case 'custom': {
                if (!customBgUrl) {
                    outputBuffer = subjectBuffer;
                    break;
                }

                let bgFileBuffer: Buffer;
                try {
                    bgFileBuffer = await resolveToBuffer(customBgUrl);
                } catch {
                    outputBuffer = subjectBuffer;
                    break;
                }

                const bgResized = await sharp(bgFileBuffer)
                    .resize(imgWidth, imgHeight, { fit: 'cover' })
                    .png()
                    .toBuffer();

                const resizedSubject = await sharp(subjectBuffer)
                    .resize(imgWidth, imgHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                outputBuffer = await sharp(bgResized)
                    .composite([{ input: resizedSubject, gravity: 'centre' }])
                    .png()
                    .toBuffer();
                break;
            }

            default:
                outputBuffer = subjectBuffer;
        }

        // Save result
        const resultId = uuidv4();
        const filename = `${resultId}.png`;
        const { url } = await storeFile('variations', filename, outputBuffer);

        return NextResponse.json({ url });
    } catch (error) {
        console.error('Remove BG error:', error);
        return NextResponse.json(
            { error: 'Remove BG failed' },
            { status: 500 }
        );
    }
}
