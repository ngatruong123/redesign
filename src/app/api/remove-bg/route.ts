import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { storeFile, resolveToBuffer } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';

// ---- Gradient presets (must match client-side) ----
const GRADIENT_MAP: Record<string, { colors: string[]; angle: number }> = {
    sunset: { colors: ['#f093fb', '#f5576c'], angle: 135 },
    ocean: { colors: ['#667eea', '#764ba2'], angle: 135 },
    mint: { colors: ['#a8edea', '#fed6e3'], angle: 135 },
    fire: { colors: ['#f12711', '#f5af19'], angle: 135 },
    sky: { colors: ['#89f7fe', '#66a6ff'], angle: 135 },
    forest: { colors: ['#11998e', '#38ef7d'], angle: 135 },
    lavender: { colors: ['#c471f5', '#fa71cd'], angle: 135 },
    night: { colors: ['#0f0c29', '#302b63', '#24243e'], angle: 135 },
    peach: { colors: ['#ffecd2', '#fcb69f'], angle: 135 },
    arctic: { colors: ['#e0eafc', '#cfdef3'], angle: 135 },
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    };
}

// Convert sRGB to CIE Lab for perceptual color comparison
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
    let rl = r / 255, gl = g / 255, bl = b / 255;
    rl = rl > 0.04045 ? Math.pow((rl + 0.055) / 1.055, 2.4) : rl / 12.92;
    gl = gl > 0.04045 ? Math.pow((gl + 0.055) / 1.055, 2.4) : gl / 12.92;
    bl = bl > 0.04045 ? Math.pow((bl + 0.055) / 1.055, 2.4) : bl / 12.92;
    let x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
    let y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750);
    let z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;
    const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
    const [L1, a1, b1Lab] = rgbToLab(r1, g1, b1);
    const [L2, a2, b2Lab] = rgbToLab(r2, g2, b2);
    return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1Lab - b2Lab) ** 2);
}

async function createGradientBuffer(width: number, height: number, gradientId: string): Promise<Buffer> {
    const preset = GRADIENT_MAP[gradientId] || GRADIENT_MAP.sunset;
    const colors = preset.colors.map(hexToRgb);

    const pixels = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const t = Math.min(1, Math.max(0, (x / width + y / height) / 2));
            const segmentCount = colors.length - 1;
            const segment = Math.min(segmentCount - 1, Math.floor(t * segmentCount));
            const localT = (t * segmentCount) - segment;

            const c0 = colors[segment];
            const c1 = colors[Math.min(segment + 1, colors.length - 1)];

            const r = Math.round(c0.r + (c1.r - c0.r) * localT);
            const g = Math.round(c0.g + (c1.g - c0.g) * localT);
            const b = Math.round(c0.b + (c1.b - c0.b) * localT);

            const off = (y * width + x) * 4;
            pixels[off] = r;
            pixels[off + 1] = g;
            pixels[off + 2] = b;
            pixels[off + 3] = 255;
        }
    }

    return sharp(pixels, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer();
}

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
