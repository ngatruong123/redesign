/**
 * Core perspective/Coons patch math shared between server and client renderers.
 */

export interface Point { x: number; y: number; }
export type FitMode = 'fill' | 'contain';

export function qbez(p0: Point, cp: Point, p1: Point, t: number): Point {
    const it = 1 - t;
    return {
        x: it * it * p0.x + 2 * it * t * cp.x + t * t * p1.x,
        y: it * it * p0.y + 2 * it * t * cp.y + t * t * p1.y,
    };
}

export function lerp(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function dist(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Coons patch interpolation using 4 boundary bezier curves.
 *
 * quad: [TL, TR, BR, BL]
 * edgeCurves: [topCP, rightCP, bottomCP, leftCP] — bezier control points.
 */
export function coonsPatch(
    quad: [Point, Point, Point, Point],
    edgeCurves: [Point, Point, Point, Point] | undefined,
    u: number,
    v: number,
): Point {
    const [tl, tr, br, bl] = quad;
    const topCP = edgeCurves ? edgeCurves[0] : midpoint(tl, tr);
    const rightCP = edgeCurves ? edgeCurves[1] : midpoint(tr, br);
    const bottomCP = edgeCurves ? edgeCurves[2] : midpoint(br, bl);
    const leftCP = edgeCurves ? edgeCurves[3] : midpoint(tl, bl);

    const topPt = qbez(tl, topCP, tr, u);
    const bottomPt = qbez(bl, bottomCP, br, u);
    const leftPt = qbez(tl, leftCP, bl, v);
    const rightPt = qbez(tr, rightCP, br, v);

    const bilinear: Point = {
        x: (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x,
        y: (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y,
    };

    const ruledU = lerp(topPt, bottomPt, v);
    const ruledV = lerp(leftPt, rightPt, u);

    return {
        x: ruledU.x + ruledV.x - bilinear.x,
        y: ruledU.y + ruledV.y - bilinear.y,
    };
}

/**
 * Compute contain-mode UV offsets/scales for fitting an image into a quad.
 */
export function computeContainUV(
    destQuad: [Point, Point, Point, Point],
    imgWidth: number,
    imgHeight: number,
): { uOff: number; vOff: number; uScale: number; vScale: number } {
    const [tl, tr, br, bl] = destQuad;
    const quadW = (dist(tl, tr) + dist(bl, br)) / 2;
    const quadH = (dist(tl, bl) + dist(tr, br)) / 2;
    const quadAR = quadW / quadH;
    const imgAR = imgWidth / imgHeight;

    let uOff = 0, vOff = 0, uScale = 1, vScale = 1;
    if (imgAR > quadAR) {
        vScale = quadAR / imgAR;
        vOff = (1 - vScale) / 2;
    } else {
        uScale = imgAR / quadAR;
        uOff = (1 - uScale) / 2;
    }
    return { uOff, vOff, uScale, vScale };
}

/**
 * Iterate over the subdivision grid, yielding source and dest coordinates for each cell.
 * Calls `handler` for each visible cell with the 4 dest points and source rect.
 */
export function iteratePerspectiveGrid(
    destQuad: [Point, Point, Point, Point],
    edgeCurves: [Point, Point, Point, Point] | undefined,
    imgWidth: number,
    imgHeight: number,
    subdivisions: number,
    fitMode: FitMode,
    handler: (
        sx: number, sy: number, sWidth: number, sHeight: number,
        p00: Point, p10: Point, p01: Point, p11: Point,
    ) => void,
) {
    let uOff = 0, vOff = 0, uScale = 1, vScale = 1;
    if (fitMode === 'contain') {
        ({ uOff, vOff, uScale, vScale } = computeContainUV(destQuad, imgWidth, imgHeight));
    }

    for (let row = 0; row < subdivisions; row++) {
        for (let col = 0; col < subdivisions; col++) {
            const u0 = col / subdivisions;
            const v0 = row / subdivisions;
            const u1 = (col + 1) / subdivisions;
            const v1 = (row + 1) / subdivisions;

            const srcU0 = (u0 - uOff) / uScale;
            const srcV0 = (v0 - vOff) / vScale;
            const srcU1 = (u1 - uOff) / uScale;
            const srcV1 = (v1 - vOff) / vScale;

            if (srcU1 <= 0 || srcU0 >= 1 || srcV1 <= 0 || srcV0 >= 1) continue;

            const cu0 = Math.max(0, srcU0), cv0 = Math.max(0, srcV0);
            const cu1 = Math.min(1, srcU1), cv1 = Math.min(1, srcV1);

            const qu0 = uOff + cu0 * uScale, qv0 = vOff + cv0 * vScale;
            const qu1 = uOff + cu1 * uScale, qv1 = vOff + cv1 * vScale;

            const p00 = coonsPatch(destQuad, edgeCurves, qu0, qv0);
            const p10 = coonsPatch(destQuad, edgeCurves, qu1, qv0);
            const p01 = coonsPatch(destQuad, edgeCurves, qu0, qv1);
            const p11 = coonsPatch(destQuad, edgeCurves, qu1, qv1);

            const sx = cu0 * imgWidth;
            const sy = cv0 * imgHeight;
            const sWidth = (cu1 - cu0) * imgWidth;
            const sHeight = (cv1 - cv0) * imgHeight;

            if (sWidth < 0.5 || sHeight < 0.5) continue;

            handler(sx, sy, sWidth, sHeight, p00, p10, p01, p11);
        }
    }
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
        rotate(x, y),
        rotate(x + w, y),
        rotate(x + w, y + h),
        rotate(x, y + h),
    ];
}

/**
 * Compute default (straight-line) edge control points for a quad.
 */
export function defaultEdgeCurves(quad: [Point, Point, Point, Point]): [Point, Point, Point, Point] {
    const [tl, tr, br, bl] = quad;
    return [
        midpoint(tl, tr),
        midpoint(tr, br),
        midpoint(br, bl),
        midpoint(tl, bl),
    ];
}
