import { useRef, useCallback, useEffect } from 'react';
import type { Point } from '@/types';

const CORNER_LABELS = ['1', '2', '3', '4'];
const EDGE_LABELS = ['T', 'R', 'B', 'L'];
const CORNER_DRAW_RADIUS = 8;
const EDGE_DRAW_RADIUS = 6;

type HandleId = { type: 'corner'; index: number } | { type: 'edge'; index: number } | { type: 'quad' };

function edgeEndpoints(quad: Point[]): [Point, Point][] {
    const [tl, tr, br, bl] = quad;
    return [[tl, tr], [tr, br], [br, bl], [tl, bl]];
}

interface UseQuadCanvasParams {
    activeTemplateImageUrl: string | undefined;
    corners: Point[];
    edgeCPs: [Point, Point, Point, Point] | null;
    dragging: HandleId | null;
    quadDone: boolean;
    dragStart: Point | null;
    dragCurrent: Point | null;
}

const MAX_CANVAS_DIM = 2000;

export function useQuadCanvas({
    activeTemplateImageUrl,
    corners,
    edgeCPs,
    dragging,
    quadDone,
    dragStart,
    dragCurrent,
}: UseQuadCanvasParams) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgCacheMap = useRef<Map<string, HTMLImageElement>>(new Map());
    const canvasSizedRef = useRef(false);
    const scaleRef = useRef(1);

    // Preload template images
    const preloadImage = useCallback((url: string) => {
        if (url && !imgCacheMap.current.has(url)) {
            const img = new Image();
            img.onload = () => imgCacheMap.current.set(url, img);
            img.src = url;
        }
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
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            ctx.save();
            ctx.scale(s, s);

            // Draw drag-to-draw preview rectangle
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

            ctx.save();

            // Draw edges
            ctx.strokeStyle = 'rgba(0, 230, 138, 0.8)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 4]);

            if (corners.length >= 2 && quadDone && edgeCPs) {
                const edges = edgeEndpoints(corners);
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                ctx.quadraticCurveTo(edgeCPs[0].x, edgeCPs[0].y, corners[1].x, corners[1].y);
                ctx.quadraticCurveTo(edgeCPs[1].x, edgeCPs[1].y, corners[2].x, corners[2].y);
                ctx.quadraticCurveTo(edgeCPs[2].x, edgeCPs[2].y, corners[3].x, corners[3].y);
                ctx.quadraticCurveTo(edgeCPs[3].x, edgeCPs[3].y, corners[0].x, corners[0].y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(0, 230, 138, 0.12)';
                ctx.fill();
                ctx.stroke();

                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
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
                    ctx.fillStyle = 'rgba(0, 230, 138, 0.15)';
                    ctx.fill();
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // Draw corner handles
            corners.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, CORNER_DRAW_RADIUS, 0, Math.PI * 2);
                const isActive = dragging?.type === 'corner' && dragging.index === i;
                ctx.fillStyle = isActive ? 'rgba(255, 200, 0, 0.9)' : 'rgba(0, 230, 138, 0.9)';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(CORNER_LABELS[i], p.x, p.y);
            });

            // Draw edge curve handles
            if (quadDone && edgeCPs) {
                edgeCPs.forEach((cp, i) => {
                    ctx.save();
                    ctx.translate(cp.x, cp.y);
                    ctx.rotate(Math.PI / 4);
                    const isActive = dragging?.type === 'edge' && dragging.index === i;
                    const size = EDGE_DRAW_RADIUS;
                    ctx.fillStyle = isActive ? 'rgba(255, 150, 0, 0.9)' : 'rgba(255, 200, 0, 0.85)';
                    ctx.fillRect(-size, -size, size * 2, size * 2);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(-size, -size, size * 2, size * 2);
                    ctx.restore();

                    ctx.fillStyle = '#333';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(EDGE_LABELS[i], cp.x, cp.y);
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
    }, [activeTemplateImageUrl, corners, edgeCPs, dragging, quadDone, dragStart, dragCurrent]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    const getCoords = useCallback((clientX: number, clientY: number): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const s = scaleRef.current;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width) / s,
            y: (clientY - rect.top) * (canvas.height / rect.height) / s,
        };
    }, []);

    const resetCanvasSize = useCallback(() => {
        canvasSizedRef.current = false;
    }, []);

    return {
        canvasRef,
        scaleRef,
        imgCacheMap,
        drawCanvas,
        getCoords,
        preloadImage,
        resetCanvasSize,
    };
}
