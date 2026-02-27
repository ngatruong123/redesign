import { useState, useRef, useCallback, useEffect } from 'react';
import type { MockupMask, Point } from '@/types';

const MAX_HISTORY = 20;

function defaultEdgeCurves(quad: Point[]): [Point, Point, Point, Point] {
    const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const [tl, tr, br, bl] = quad;
    return [mid(tl, tr), mid(tr, br), mid(br, bl), mid(tl, bl)];
}

interface UseMaskHistoryParams {
    activeTemplateId: string | null;
    updateMockupTemplate: (id: string, updates: Partial<{ mask: MockupMask | null }>) => void;
    setCorners: (corners: Point[]) => void;
    setEdgeCPs: (cps: [Point, Point, Point, Point] | null) => void;
    setPlacingCorner: (n: number) => void;
}

export function useMaskHistory({
    activeTemplateId,
    updateMockupTemplate,
    setCorners,
    setEdgeCPs,
    setPlacingCorner,
}: UseMaskHistoryParams) {
    const [maskHistory, setMaskHistory] = useState<(MockupMask | null)[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const historyRef = useRef<{ history: (MockupMask | null)[]; index: number }>({ history: [], index: -1 });
    historyRef.current = { history: maskHistory, index: historyIndex };

    const pushHistory = useCallback((mask: MockupMask | null) => {
        const { history, index } = historyRef.current;
        const next = [...history.slice(0, index + 1), mask].slice(-MAX_HISTORY);
        const newIdx = next.length - 1;
        setMaskHistory(next);
        setHistoryIndex(newIdx);
    }, []);

    const restoreMask = useCallback((mask: MockupMask | null) => {
        if (!activeTemplateId) return;
        updateMockupTemplate(activeTemplateId, { mask });
        if (mask?.quad) {
            setCorners([...mask.quad]);
            setEdgeCPs(mask.edgeCurves ? [...mask.edgeCurves] : defaultEdgeCurves(mask.quad));
            setPlacingCorner(4);
        } else {
            setCorners([]);
            setEdgeCPs(null);
            setPlacingCorner(0);
        }
    }, [activeTemplateId, updateMockupTemplate, setCorners, setEdgeCPs, setPlacingCorner]);

    const undo = useCallback(() => {
        const { history, index } = historyRef.current;
        if (index <= 0 || !activeTemplateId) return;
        const newIdx = index - 1;
        setHistoryIndex(newIdx);
        restoreMask(history[newIdx]);
    }, [activeTemplateId, restoreMask]);

    const redo = useCallback(() => {
        const { history, index } = historyRef.current;
        if (index >= history.length - 1 || !activeTemplateId) return;
        const newIdx = index + 1;
        setHistoryIndex(newIdx);
        restoreMask(history[newIdx]);
    }, [activeTemplateId, restoreMask]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo]);

    const resetHistory = useCallback((mask: MockupMask | null) => {
        setMaskHistory(mask ? [mask] : []);
        setHistoryIndex(mask ? 0 : -1);
    }, []);

    return {
        maskHistory,
        historyIndex,
        pushHistory,
        undo,
        redo,
        resetHistory,
    };
}
