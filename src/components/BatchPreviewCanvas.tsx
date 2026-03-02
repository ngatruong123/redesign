'use client';

import { useEffect, useRef, useState } from 'react';
import type { MockupMask, Point } from '@/types';
import { drawPerspectiveClient } from '@/lib/perspective-client';

interface Props {
    templateImageUrl: string;
    designImageUrl: string;
    mask: MockupMask;
    overlay?: { x: number; y: number; width: number; height: number; rotation?: number };
    width?: number;
}

function rectToQuad(
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
    return [rotate(x, y), rotate(x + w, y), rotate(x + w, y + h), rotate(x, y + h)];
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export default function BatchPreviewCanvas({ templateImageUrl, designImageUrl, mask, overlay, width = 200 }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            let templateImg: HTMLImageElement;
            let designImg: HTMLImageElement;
            try {
                [templateImg, designImg] = await Promise.all([
                    loadImage(templateImageUrl),
                    loadImage(designImageUrl),
                ]);
            } catch {
                if (!cancelled) setError(true);
                return;
            }

            if (cancelled) return;
            setError(false);

            const canvas = canvasRef.current;
            if (!canvas) return;

            const scale = width / templateImg.width;
            const cw = width;
            const ch = templateImg.height * scale;

            canvas.width = cw;
            canvas.height = ch;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Draw template
            ctx.drawImage(templateImg, 0, 0, cw, ch);

            // Compute quad in scaled coordinates
            const quad: [Point, Point, Point, Point] = mask.mode === 'quad' && mask.quad
                ? mask.quad.map(p => ({ x: p.x * scale, y: p.y * scale })) as [Point, Point, Point, Point]
                : rectToQuad(
                    mask.x * scale, mask.y * scale,
                    mask.width * scale, mask.height * scale,
                    mask.rotation,
                );

            const edgeCurves = mask.edgeCurves
                ? mask.edgeCurves.map(p => ({ x: p.x * scale, y: p.y * scale })) as [Point, Point, Point, Point]
                : undefined;

            // Apply blend mode and opacity
            ctx.globalAlpha = (mask.opacity ?? 100) / 100;
            ctx.globalCompositeOperation = mask.blendMode === 'normal' ? 'source-over'
                : mask.blendMode === 'soft-light' ? 'soft-light'
                : mask.blendMode as GlobalCompositeOperation;

            if (overlay) {
                // Overlay mode: draw design directly at overlay position (no perspective warp)
                ctx.save();
                if (overlay.rotation) {
                    const ocx = (overlay.x + overlay.width / 2) * scale;
                    const ocy = (overlay.y + overlay.height / 2) * scale;
                    ctx.translate(ocx, ocy);
                    ctx.rotate((overlay.rotation * Math.PI) / 180);
                    ctx.drawImage(designImg, -overlay.width * scale / 2, -overlay.height * scale / 2, overlay.width * scale, overlay.height * scale);
                } else {
                    ctx.drawImage(designImg, overlay.x * scale, overlay.y * scale, overlay.width * scale, overlay.height * scale);
                }
                ctx.restore();
            } else {
                drawPerspectiveClient(ctx, designImg, quad, edgeCurves, 5, mask.fitMode || 'contain');
            }

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        })();

        return () => { cancelled = true; };
    }, [templateImageUrl, designImageUrl, mask, overlay, width]);

    if (error) {
        // Fallback: show template image only
        return <img src={templateImageUrl} alt="preview" style={{ width: '100%', borderRadius: 6, opacity: 0.5 }} />;
    }

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 6 }}
        />
    );
}
