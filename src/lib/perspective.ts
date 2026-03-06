import type { SKRSContext2D, Image as CanvasImage } from '@napi-rs/canvas';
import { iteratePerspectiveGrid, type Point, type FitMode } from './perspective-core';

export type { FitMode } from './perspective-core';
export { rectToQuad, defaultEdgeCurves } from './perspective-core';

/**
 * Draw an image with perspective/curved warp using Coons patch + triangulated mesh.
 * Server-side version using @napi-rs/canvas.
 */
export function drawPerspective(
    ctx: SKRSContext2D,
    img: CanvasImage,
    destQuad: [Point, Point, Point, Point],
    edgeCurves?: [Point, Point, Point, Point],
    subdivisions = 16,
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
    ctx: SKRSContext2D,
    img: CanvasImage,
    sx: number, sy: number, sw: number, sh: number,
    p0: Point, p1: Point, p2: Point,
) {
    // Expand triangle to cover anti-aliasing seam gaps
    const cx = (p0.x + p1.x + p2.x) / 3;
    const cy = (p0.y + p1.y + p2.y) / 3;
    const expand = 1.0;
    const nudge = (p: Point) => {
        const dx = p.x - cx, dy = p.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        return { x: p.x + dx / dist * expand, y: p.y + dy / dist * expand };
    };
    const e0 = nudge(p0), e1 = nudge(p1), e2 = nudge(p2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(e0.x, e0.y);
    ctx.lineTo(e1.x, e1.y);
    ctx.lineTo(e2.x, e2.y);
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

    ctx.drawImage(img, 0, 0);
    ctx.restore();
}
