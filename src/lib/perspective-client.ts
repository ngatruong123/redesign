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
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
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
