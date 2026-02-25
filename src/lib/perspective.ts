import type { SKRSContext2D, Image as CanvasImage } from '@napi-rs/canvas';

interface Point { x: number; y: number; }

/**
 * Quadratic bezier at parameter t, with control point cp.
 */
function qbez(p0: Point, cp: Point, p1: Point, t: number): Point {
    const it = 1 - t;
    return {
        x: it * it * p0.x + 2 * it * t * cp.x + t * t * p1.x,
        y: it * it * p0.y + 2 * it * t * cp.y + t * t * p1.y,
    };
}

function lerp(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Coons patch interpolation using 4 boundary bezier curves.
 *
 * quad: [TL, TR, BR, BL]
 * edgeCurves: [topCP, rightCP, bottomCP, leftCP] — bezier control points.
 *   If undefined, edges are straight lines.
 *
 * u goes along top/bottom (TL→TR), v goes along left/right (TL→BL).
 */
function coonsPatch(
    quad: [Point, Point, Point, Point],
    edgeCurves: [Point, Point, Point, Point] | undefined,
    u: number,
    v: number,
): Point {
    const [tl, tr, br, bl] = quad;

    // Default control points = midpoints (straight edges)
    const topCP = edgeCurves ? edgeCurves[0] : midpoint(tl, tr);
    const rightCP = edgeCurves ? edgeCurves[1] : midpoint(tr, br);
    const bottomCP = edgeCurves ? edgeCurves[2] : midpoint(br, bl);
    const leftCP = edgeCurves ? edgeCurves[3] : midpoint(tl, bl);

    // Boundary curves
    // top:    TL → TR  (u)
    // bottom: BL → BR  (u)  — note: bottom goes BL→BR so u matches direction
    // left:   TL → BL  (v)
    // right:  TR → BR  (v)
    const topPt = qbez(tl, topCP, tr, u);
    const bottomPt = qbez(bl, bottomCP, br, u);
    const leftPt = qbez(tl, leftCP, bl, v);
    const rightPt = qbez(tr, rightCP, br, v);

    // Bilinear blend of corners (Lc)
    const bilinear: Point = {
        x: (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x,
        y: (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y,
    };

    // Coons: P(u,v) = top/bottom lerp + left/right lerp - bilinear corners
    // Ruled surface along u: lerp(top(u), bottom(u), v)
    // Ruled surface along v: lerp(left(v), right(v), u)
    const ruledU = lerp(topPt, bottomPt, v);
    const ruledV = lerp(leftPt, rightPt, u);

    return {
        x: ruledU.x + ruledV.x - bilinear.x,
        y: ruledU.y + ruledV.y - bilinear.y,
    };
}

function dist(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export type FitMode = 'fill' | 'contain';

/**
 * Draw an image with perspective/curved warp using Coons patch + triangulated mesh.
 *
 * destQuad: [TL, TR, BR, BL]
 * edgeCurves: [topCP, rightCP, bottomCP, leftCP] bezier control points (optional)
 * fitMode: 'fill' stretches to fill quad, 'contain' keeps aspect ratio (default)
 */
export function drawPerspective(
    ctx: SKRSContext2D,
    img: CanvasImage,
    destQuad: [Point, Point, Point, Point],
    edgeCurves?: [Point, Point, Point, Point],
    subdivisions = 16,
    fitMode: FitMode = 'contain',
) {
    const sw = img.width;
    const sh = img.height;

    // Compute UV sub-region for contain mode
    let uOff = 0, vOff = 0, uScale = 1, vScale = 1;

    if (fitMode === 'contain') {
        const [tl, tr, br, bl] = destQuad;
        // Estimate quad dimensions from average edge lengths
        const quadW = (dist(tl, tr) + dist(bl, br)) / 2;
        const quadH = (dist(tl, bl) + dist(tr, br)) / 2;
        const quadAR = quadW / quadH;
        const imgAR = sw / sh;

        // Contain: fit image inside quad, preserve aspect ratio, center it
        if (imgAR > quadAR) {
            // Image wider than quad → fit by width, pad top/bottom
            vScale = quadAR / imgAR;
            vOff = (1 - vScale) / 2;
        } else {
            // Image taller than quad → fit by height, pad left/right
            uScale = imgAR / quadAR;
            uOff = (1 - uScale) / 2;
        }
    }

    for (let row = 0; row < subdivisions; row++) {
        for (let col = 0; col < subdivisions; col++) {
            const u0 = col / subdivisions;
            const v0 = row / subdivisions;
            const u1 = (col + 1) / subdivisions;
            const v1 = (row + 1) / subdivisions;

            // Map grid cell to source image UV (inverse of contain mapping)
            const srcU0 = (u0 - uOff) / uScale;
            const srcV0 = (v0 - vOff) / vScale;
            const srcU1 = (u1 - uOff) / uScale;
            const srcV1 = (v1 - vOff) / vScale;

            // Skip cells entirely outside image bounds
            if (srcU1 <= 0 || srcU0 >= 1 || srcV1 <= 0 || srcV0 >= 1) continue;

            // Clamp source to [0,1]
            const cu0 = Math.max(0, srcU0), cv0 = Math.max(0, srcV0);
            const cu1 = Math.min(1, srcU1), cv1 = Math.min(1, srcV1);

            // Map clamped source back to quad UV for dest points
            const qu0 = uOff + cu0 * uScale, qv0 = vOff + cv0 * vScale;
            const qu1 = uOff + cu1 * uScale, qv1 = vOff + cv1 * vScale;

            const p00 = coonsPatch(destQuad, edgeCurves, qu0, qv0);
            const p10 = coonsPatch(destQuad, edgeCurves, qu1, qv0);
            const p01 = coonsPatch(destQuad, edgeCurves, qu0, qv1);
            const p11 = coonsPatch(destQuad, edgeCurves, qu1, qv1);

            const sx = cu0 * sw;
            const sy = cv0 * sh;
            const sWidth = (cu1 - cu0) * sw;
            const sHeight = (cv1 - cv0) * sh;

            if (sWidth < 0.5 || sHeight < 0.5) continue;

            drawTriangle(ctx, img, sx, sy, sWidth, sHeight, p00, p10, p01);
            drawTriangle(ctx, img, sx + sWidth, sy + sHeight, -sWidth, -sHeight, p11, p01, p10);
        }
    }
}

function drawTriangle(
    ctx: SKRSContext2D,
    img: CanvasImage,
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

    ctx.drawImage(img, 0, 0);
    ctx.restore();
}

/**
 * Convert legacy rect+rotation mask to quad points.
 */
export function rectToQuad(
    x: number, y: number, w: number, h: number, rotation: number,
): [Point, Point, Point, Point] {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotate = (px: number, py: number): Point => ({
        x: cos * (px - cx) - sin * (py - cy) + cx,
        y: sin * (px - cx) + cos * (py - cy) + cy,
    });

    return [
        rotate(x, y),           // TL
        rotate(x + w, y),       // TR
        rotate(x + w, y + h),   // BR
        rotate(x, y + h),       // BL
    ];
}

/**
 * Compute default (straight-line) edge control points for a quad.
 * Returns midpoints of each edge: [top, right, bottom, left]
 */
export function defaultEdgeCurves(quad: [Point, Point, Point, Point]): [Point, Point, Point, Point] {
    const [tl, tr, br, bl] = quad;
    return [
        midpoint(tl, tr),  // top
        midpoint(tr, br),  // right
        midpoint(br, bl),  // bottom (BL→BR direction, midpoint same)
        midpoint(tl, bl),  // left
    ];
}
