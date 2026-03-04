/**
 * Color conversion and perceptual comparison utilities.
 */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    };
}

/** Convert sRGB to CIE Lab for perceptual color comparison */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
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

/** CIE76 Delta E between two sRGB colors */
export function deltaE(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
    const [L1, a1, b1Lab] = rgbToLab(r1, g1, b1);
    const [L2, a2, b2Lab] = rgbToLab(r2, g2, b2);
    return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1Lab - b2Lab) ** 2);
}
