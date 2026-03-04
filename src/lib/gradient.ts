/**
 * Gradient presets and buffer generation for background replacement.
 */
import sharp from 'sharp';
import { hexToRgb } from './color-science';

export const GRADIENT_MAP: Record<string, { colors: string[]; angle: number }> = {
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

export async function createGradientBuffer(width: number, height: number, gradientId: string): Promise<Buffer> {
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
