'use client';

import { useCallback, useRef, useEffect } from 'react';
import type { Point } from '@/types';
import type { HandleId } from '@/hooks/useQuadInteraction';

interface UseCanvasDrawingOptions {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    scaleRef: React.MutableRefObject<number>;
    activeTemplateImageUrl: string | undefined;
    corners: Point[];
    edgeCPs: [Point, Point, Point, Point] | null;
    dragging: HandleId | null;
    quadDone: boolean;
    dragStart: Point | null;
    dragCurrent: Point | null;
    bgBlurEnabled: boolean;
    bgBlur: number;
    hideQuad?: boolean;
}

const MAX_CANVAS_DIM = 1200;

export function useCanvasDrawing({
    canvasRef,
    scaleRef,
    activeTemplateImageUrl,
    corners,
    edgeCPs,
    dragging,
    quadDone,
    dragStart,
    dragCurrent,
    bgBlurEnabled,
    bgBlur,
    hideQuad,
}: UseCanvasDrawingOptions) {
    const imgCacheMap = useRef<Map<string, HTMLImageElement>>(new Map());
    const canvasSizedRef = useRef(false);

    const resetCanvasSize = useCallback(() => {
        canvasSizedRef.current = false;
    }, []);

    const drawCanvas = useCallback(() => {
        if (!activeTemplateImageUrl || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = (img: HTMLImageElement) => {
            if (!canvasSizedRef.current) {
                const scale = Math.min(1, MAX_CANVAS_DIM / Math.max(img.naturalWidth, img.naturalHeight));
                scaleRef.current = scale;
                canvas.width = Math.round(img.naturalWidth * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                canvasSizedRef.current = true;
            }
            const s = scaleRef.current;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (bgBlurEnabled && bgBlur > 0) {
                ctx.save();
                ctx.filter = `blur(${bgBlur}px)`;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.restore();
            } else {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }

            ctx.save();
            ctx.scale(s, s);

            if (hideQuad) {
                ctx.restore();
                ctx.restore();
                return;
            }

            if (dragStart && dragCurrent && corners.length === 0) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 230, 138, 0.8)';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 4]);
                const rx = Math.min(dragStart.x, dragCurrent.x);
                const ry = Math.min(dragStart.y, dragCurrent.y);
                const rw = Math.abs(dragCurrent.x - dragStart.x);
                const rh = Math.abs(dragCurrent.y - dragStart.y);
                ctx.strokeRect(rx, ry, rw, rh);
                ctx.fillStyle = 'rgba(0, 230, 138, 0.08)';
                ctx.fillRect(rx, ry, rw, rh);
                ctx.restore();
                ctx.restore();
                return;
            }

            if (corners.length === 0) { ctx.restore(); return; }

            // Purple color matching overlay style
            const PURPLE = 'rgba(160, 120, 255, 0.8)';
            const PURPLE_FILL = 'rgba(160, 120, 255, 0.08)';
            const PURPLE_ACTIVE = 'rgba(160, 120, 255, 1)';

            ctx.save();
            ctx.strokeStyle = PURPLE;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);

            if (corners.length >= 2 && quadDone && edgeCPs) {
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                ctx.quadraticCurveTo(edgeCPs[0].x, edgeCPs[0].y, corners[1].x, corners[1].y);
                ctx.quadraticCurveTo(edgeCPs[1].x, edgeCPs[1].y, corners[2].x, corners[2].y);
                ctx.quadraticCurveTo(edgeCPs[2].x, edgeCPs[2].y, corners[3].x, corners[3].y);
                ctx.quadraticCurveTo(edgeCPs[3].x, edgeCPs[3].y, corners[0].x, corners[0].y);
                ctx.closePath();
                ctx.fillStyle = PURPLE_FILL;
                ctx.fill();
                ctx.stroke();

                // Edge curve guide lines (subtle)
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(160, 120, 255, 0.3)';
                const edgeEndpoints = (q: Point[]): [Point, Point][] => {
                    const [tl, tr, br, bl] = q;
                    return [[tl, tr], [tr, br], [br, bl], [tl, bl]];
                };
                const edges = edgeEndpoints(corners);
                edges.forEach(([start, end], i) => {
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(edgeCPs[i].x, edgeCPs[i].y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                });
            } else if (corners.length >= 2) {
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                for (let i = 1; i < corners.length; i++) {
                    ctx.lineTo(corners[i].x, corners[i].y);
                }
                if (corners.length === 4) {
                    ctx.closePath();
                    ctx.fillStyle = PURPLE_FILL;
                    ctx.fill();
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // Corner handles — white circles with purple border
            const CORNER_RADIUS = 7;

            corners.forEach((p, i) => {
                const isActive = dragging?.type === 'corner' && dragging.index === i;
                ctx.beginPath();
                ctx.arc(p.x, p.y, CORNER_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = isActive ? PURPLE_ACTIVE : 'white';
                ctx.fill();
                ctx.strokeStyle = PURPLE;
                ctx.lineWidth = 2;
                ctx.stroke();
                // Shadow
                ctx.shadowColor = 'rgba(0,0,0,0.2)';
                ctx.shadowBlur = 3;
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            });

            // Edge curve handles — pill shaped
            if (quadDone && edgeCPs) {
                edgeCPs.forEach((cp, i) => {
                    const isActive = dragging?.type === 'edge' && dragging.index === i;
                    const isH = i === 0 || i === 2; // top/bottom edges are horizontal
                    const pw = isH ? 12 : 4; // pill half-width
                    const ph = isH ? 4 : 12; // pill half-height
                    const r = 3; // border radius

                    ctx.beginPath();
                    // Rounded rect
                    ctx.moveTo(cp.x - pw + r, cp.y - ph);
                    ctx.lineTo(cp.x + pw - r, cp.y - ph);
                    ctx.arcTo(cp.x + pw, cp.y - ph, cp.x + pw, cp.y - ph + r, r);
                    ctx.lineTo(cp.x + pw, cp.y + ph - r);
                    ctx.arcTo(cp.x + pw, cp.y + ph, cp.x + pw - r, cp.y + ph, r);
                    ctx.lineTo(cp.x - pw + r, cp.y + ph);
                    ctx.arcTo(cp.x - pw, cp.y + ph, cp.x - pw, cp.y + ph - r, r);
                    ctx.lineTo(cp.x - pw, cp.y - ph + r);
                    ctx.arcTo(cp.x - pw, cp.y - ph, cp.x - pw + r, cp.y - ph, r);
                    ctx.closePath();

                    ctx.fillStyle = isActive ? 'rgba(255, 150, 0, 1)' : 'rgba(255, 200, 0, 0.9)';
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                });
            }

            ctx.restore();
            ctx.restore();
        };

        const cachedImg = imgCacheMap.current.get(activeTemplateImageUrl);
        if (cachedImg) {
            draw(cachedImg);
        } else {
            const img = new Image();
            img.onload = () => { imgCacheMap.current.set(activeTemplateImageUrl, img); draw(img); };
            img.src = activeTemplateImageUrl;
        }
    }, [activeTemplateImageUrl, corners, edgeCPs, dragging, quadDone, dragStart, dragCurrent, bgBlurEnabled, bgBlur, hideQuad, canvasRef, scaleRef]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    // Preload template images
    const preloadImages = useCallback((imageUrls: string[]) => {
        for (const url of imageUrls) {
            if (url && !imgCacheMap.current.has(url)) {
                const img = new Image();
                img.onload = () => imgCacheMap.current.set(url, img);
                img.src = url;
            }
        }
    }, []);

    return { drawCanvas, resetCanvasSize, preloadImages, imgCacheMap };
}
