/**
 * Browser-compatible perspective draw using Canvas2D API.
 * Uses shared core math from perspective-core.ts.
 */
import { iteratePerspectiveGrid, type Point, type FitMode } from './perspective-core';

export type { FitMode } from './perspective-core';

export function drawPerspectiveClient(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | HTMLCanvasElement,
    destQuad: [Point, Point, Point, Point],
    edgeCurves?: [Point, Point, Point, Point],
    subdivisions = 6,
    fitMode: FitMode = 'contain',
) {
    iteratePerspectiveGrid(
        destQuad, edgeCurves,
        img.width, img.height,
        subdivisions, fitMode,
        (sx, sy, sWidth, sHeight, p00, p10, p01, p11) => {
            drawTriangle(ctx, img, sx, sy, sWidth, sHeight, p00, p10, p01);
            drawTriangle(ctx, img, sx + sWidth, sy + sHeight, -sWidth, -sHeight, p11, p01, p10);
        },
    );
}

function drawTriangle(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | HTMLCanvasElement | CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    p0: Point, p1: Point, p2: Point,
) {
    // Expand triangle slightly to cover anti-aliasing seam gaps
    const cx = (p0.x + p1.x + p2.x) / 3;
    const cy = (p0.y + p1.y + p2.y) / 3;
    const expand = 0.5;
    const ep = [p0, p1, p2].map(p => {
        const d = Math.hypot(p.x - cx, p.y - cy);
        return d > 0 ? { x: p.x + (p.x - cx) * expand / d, y: p.y + (p.y - cy) * expand / d } : p;
    });

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ep[0].x, ep[0].y);
    ctx.lineTo(ep[1].x, ep[1].y);
    ctx.lineTo(ep[2].x, ep[2].y);
    ctx.closePath();
    ctx.clip();

    const dx0 = p1.x - p0.x, dy0 = p1.y - p0.y;
    const dx1 = p2.x - p0.x, dy1 = p2.y - p0.y;

    ctx.setTransform(
        dx0 / sw, dy0 / sw,
        dx1 / sh, dy1 / sh,
        p0.x - (dx0 / sw) * sx - (dx1 / sh) * sy,
        p0.y - (dy0 / sw) * sx - (dy1 / sh) * sy,
    );

    ctx.drawImage(img as CanvasImageSource, 0, 0);
    ctx.restore();
}
