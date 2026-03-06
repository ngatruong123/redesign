import sharp from 'sharp';
import { hexToRgb } from './color-science';
import { createGradientBuffer } from './gradient';
import { resolveToBuffer } from './blob-storage';

/**
 * Resize subject to fit within target dimensions with transparent padding.
 */
async function resizeSubject(subjectBuffer: Buffer, width: number, height: number): Promise<Buffer> {
    return sharp(subjectBuffer)
        .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
}

/**
 * Composite subject on top of a background buffer.
 */
async function compositeOnBg(bgBuffer: Buffer, subjectBuffer: Buffer, width: number, height: number): Promise<Buffer> {
    const resized = await resizeSubject(subjectBuffer, width, height);
    return sharp(bgBuffer)
        .composite([{ input: resized, gravity: 'centre' }])
        .png()
        .toBuffer();
}

/**
 * Compose final output based on background mode.
 */
export async function composeBg(
    subjectBuffer: Buffer,
    sourceBuffer: Buffer,
    width: number,
    height: number,
    mode: string,
    options: { bgColor?: string; gradientId?: string; customBgUrl?: string },
): Promise<Buffer> {
    switch (mode) {
        case 'transparent':
            return subjectBuffer;

        case 'solid': {
            const rgb = hexToRgb(options.bgColor || '#ffffff');
            const bg = await sharp({
                create: { width, height, channels: 4, background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 255 } },
            }).png().toBuffer();
            return compositeOnBg(bg, subjectBuffer, width, height);
        }

        case 'blur': {
            const bg = await sharp(sourceBuffer).resize(width, height, { fit: 'cover' }).blur(30).png().toBuffer();
            return compositeOnBg(bg, subjectBuffer, width, height);
        }

        case 'gradient': {
            const bg = await createGradientBuffer(width, height, options.gradientId || 'sunset');
            return compositeOnBg(bg, subjectBuffer, width, height);
        }

        case 'custom': {
            if (!options.customBgUrl) return subjectBuffer;
            try {
                const bgFile = await resolveToBuffer(options.customBgUrl);
                const bg = await sharp(bgFile).resize(width, height, { fit: 'cover' }).png().toBuffer();
                return compositeOnBg(bg, subjectBuffer, width, height);
            } catch {
                return subjectBuffer;
            }
        }

        default:
            return subjectBuffer;
    }
}
