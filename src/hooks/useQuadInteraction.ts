import { useState, useRef, useCallback } from 'react';
import type { MockupMask, Point } from '@/types';

const CORNER_HIT_RADIUS = 15;

export type HandleId = { type: 'corner'; index: number } | { type: 'edge'; index: number } | { type: 'quad' };

function mid(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function defaultEdgeCurves(quad: Point[]): [Point, Point, Point, Point] {
    const [tl, tr, br, bl] = quad;
    return [mid(tl, tr), mid(tr, br), mid(br, bl), mid(tl, bl)];
}

function pointInQuad(p: Point, quad: Point[]): boolean {
    if (quad.length < 4) return false;
    let inside = false;
    for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
        const xi = quad[i].x, yi = quad[i].y;
        const xj = quad[j].x, yj = quad[j].y;
        if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

interface UseQuadInteractionParams {
    getCoords: (clientX: number, clientY: number) => Point;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    scaleRef: React.RefObject<number>;
    activeTemplateId: string | null;
    commitMask: () => void;
    commitMaskDirect: (quadCorners: Point[], edgeCurves: [Point, Point, Point, Point]) => void;
}

export function useQuadInteraction({
    getCoords,
    canvasRef,
    scaleRef,
    activeTemplateId,
    commitMask,
    commitMaskDirect,
}: UseQuadInteractionParams) {
    const [placingCorner, setPlacingCorner] = useState(0);
    const [corners, setCorners] = useState<Point[]>([]);
    const [edgeCPs, setEdgeCPs] = useState<[Point, Point, Point, Point] | null>(null);
    const [dragging, setDragging] = useState<HandleId | null>(null);
    const [dragStart, setDragStart] = useState<Point | null>(null);
    const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
    const [lastDragPos, setLastDragPos] = useState<Point | null>(null);
    const rafRef = useRef<number>(0);

    const quadDone = corners.length === 4;
    const MIN_DRAG_SIZE = 20;

    const findNearHandle = useCallback((p: Point): HandleId | null => {
        const canvas = canvasRef.current;
        const scale = canvas ? canvas.width / canvas.getBoundingClientRect().width : 1;
        const hitR = CORNER_HIT_RADIUS * scale;

        for (let i = 0; i < corners.length; i++) {
            const dx = corners[i].x - p.x, dy = corners[i].y - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < hitR) return { type: 'corner', index: i };
        }
        if (edgeCPs) {
            for (let i = 0; i < edgeCPs.length; i++) {
                const dx = edgeCPs[i].x - p.x, dy = edgeCPs[i].y - p.y;
                if (Math.sqrt(dx * dx + dy * dy) < hitR) return { type: 'edge', index: i };
            }
        }
        if (corners.length === 4 && pointInQuad(p, corners)) {
            return { type: 'quad' };
        }
        return null;
    }, [corners, edgeCPs, canvasRef]);

    const handlePointerDown = useCallback((clientX: number, clientY: number) => {
        const coords = getCoords(clientX, clientY);

        if (quadDone) {
            const handle = findNearHandle(coords);
            if (handle) {
                setDragging(handle);
                if (handle.type === 'quad') setLastDragPos(coords);
            }
        } else {
            if (corners.length === 0) {
                setDragStart(coords);
                setDragCurrent(coords);
            } else {
                const newCorners = [...corners, coords];
                setCorners(newCorners);
                const next = placingCorner + 1;
                setPlacingCorner(next);
                if (next === 4) {
                    const newEdgeCPs = defaultEdgeCurves(newCorners);
                    setEdgeCPs(newEdgeCPs);
                    commitMaskDirect(newCorners, newEdgeCPs);
                }
            }
        }
    }, [quadDone, corners, placingCorner, findNearHandle, getCoords, commitMaskDirect]);

    const handlePointerMove = useCallback((clientX: number, clientY: number) => {
        const coords = getCoords(clientX, clientY);

        if (dragStart && !quadDone) {
            setDragCurrent(coords);
            return;
        }

        if (!dragging && quadDone && canvasRef.current) {
            const handle = findNearHandle(coords);
            if (handle?.type === 'quad') {
                canvasRef.current.style.cursor = 'move';
            } else if (handle) {
                canvasRef.current.style.cursor = 'grab';
            } else {
                canvasRef.current.style.cursor = 'default';
            }
        }

        if (!dragging) return;

        if (dragging.type === 'corner') {
            setCorners(prev => {
                const next = [...prev];
                next[dragging.index] = coords;
                return next;
            });
        } else if (dragging.type === 'edge') {
            setEdgeCPs(prev => {
                if (!prev) return prev;
                const next: [Point, Point, Point, Point] = [...prev];
                next[dragging.index] = coords;
                return next;
            });
        } else if (dragging.type === 'quad' && lastDragPos) {
            const dx = coords.x - lastDragPos.x;
            const dy = coords.y - lastDragPos.y;
            setLastDragPos(coords);
            setCorners(prev => prev.map(p => ({ x: p.x + dx, y: p.y + dy })));
            setEdgeCPs(prev => {
                if (!prev) return prev;
                return prev.map(p => ({ x: p.x + dx, y: p.y + dy })) as [Point, Point, Point, Point];
            });
        }
    }, [dragStart, quadDone, dragging, lastDragPos, findNearHandle, getCoords, canvasRef]);

    const handlePointerUp = useCallback(() => {
        if (dragStart && dragCurrent && !quadDone) {
            const dx = Math.abs(dragCurrent.x - dragStart.x);
            const dy = Math.abs(dragCurrent.y - dragStart.y);
            if (dx >= MIN_DRAG_SIZE && dy >= MIN_DRAG_SIZE) {
                const minX = Math.min(dragStart.x, dragCurrent.x);
                const minY = Math.min(dragStart.y, dragCurrent.y);
                const maxX = Math.max(dragStart.x, dragCurrent.x);
                const maxY = Math.max(dragStart.y, dragCurrent.y);
                const newCorners: Point[] = [
                    { x: minX, y: minY },
                    { x: maxX, y: minY },
                    { x: maxX, y: maxY },
                    { x: minX, y: maxY },
                ];
                setCorners(newCorners);
                setPlacingCorner(4);
                const newEdgeCPs = defaultEdgeCurves(newCorners);
                setEdgeCPs(newEdgeCPs);
                commitMaskDirect(newCorners, newEdgeCPs);
            } else {
                setCorners([dragStart]);
                setPlacingCorner(1);
            }
            setDragStart(null);
            setDragCurrent(null);
            return;
        }

        if (dragging) {
            setDragging(null);
            setLastDragPos(null);
            commitMask();
        }
    }, [dragStart, dragCurrent, quadDone, dragging, commitMask, commitMaskDirect]);

    // Mouse/Touch handlers
    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => handlePointerDown(e.clientX, e.clientY), [handlePointerDown]);
    const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
        if (rafRef.current) return;
        const cx = e.clientX, cy = e.clientY;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            handlePointerMove(cx, cy);
        });
    }, [handlePointerMove]);
    const handleCanvasMouseUp = useCallback(() => handlePointerUp(), [handlePointerUp]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault(); handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }, [handlePointerDown]);
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        if (rafRef.current) return;
        const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            handlePointerMove(cx, cy);
        });
    }, [handlePointerMove]);
    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        e.preventDefault(); handlePointerUp();
    }, [handlePointerUp]);

    const handleResetMask = useCallback(() => {
        setCorners([]);
        setEdgeCPs(null);
        setPlacingCorner(0);
        setDragging(null);
        setDragStart(null);
        setDragCurrent(null);
        setLastDragPos(null);
    }, []);

    const handleResetCurves = useCallback(() => {
        if (!quadDone) return;
        setEdgeCPs(defaultEdgeCurves(corners));
    }, [quadDone, corners]);

    // Restore state from template mask
    const restoreFromMask = useCallback((mask: MockupMask | null) => {
        if (mask && mask.mode === 'quad' && mask.quad) {
            setCorners([...mask.quad]);
            setEdgeCPs(mask.edgeCurves ? [...mask.edgeCurves] : defaultEdgeCurves(mask.quad));
            setPlacingCorner(4);
        } else if (mask) {
            const rad = ((mask.rotation || 0) * Math.PI) / 180;
            const cx = mask.x + mask.width / 2;
            const cy = mask.y + mask.height / 2;
            const rot = (px: number, py: number): Point => ({
                x: Math.cos(rad) * (px - cx) - Math.sin(rad) * (py - cy) + cx,
                y: Math.sin(rad) * (px - cx) + Math.cos(rad) * (py - cy) + cy,
            });
            const q: Point[] = [
                rot(mask.x, mask.y),
                rot(mask.x + mask.width, mask.y),
                rot(mask.x + mask.width, mask.y + mask.height),
                rot(mask.x, mask.y + mask.height),
            ];
            setCorners(q);
            setEdgeCPs(defaultEdgeCurves(q));
            setPlacingCorner(4);
        } else {
            setCorners([]);
            setEdgeCPs(null);
            setPlacingCorner(0);
        }
        setDragStart(null);
        setDragCurrent(null);
        setDragging(null);
        setLastDragPos(null);
    }, []);

    return {
        corners,
        setCorners,
        edgeCPs,
        setEdgeCPs,
        placingCorner,
        setPlacingCorner,
        dragging,
        dragStart,
        dragCurrent,
        quadDone,
        handleCanvasMouseDown,
        handleCanvasMouseMove,
        handleCanvasMouseUp,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        handleResetMask,
        handleResetCurves,
        restoreFromMask,
    };
}
