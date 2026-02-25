'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { v4 as uuidv4 } from 'uuid';
import Lightbox from './Lightbox';
import RemoveBgPanel from './RemoveBgPanel';
import SEOPanel from './SEOPanel';
import type { MockupMask, Point } from '@/types';

const MAX_HISTORY = 20;
const CORNER_LABELS = ['1', '2', '3', '4'];
const EDGE_LABELS = ['T', 'R', 'B', 'L'];
const CORNER_HIT_RADIUS = 15;
const CORNER_DRAW_RADIUS = 8;
const EDGE_DRAW_RADIUS = 6;

const BLEND_OPTIONS: MockupMask['blendMode'][] = ['normal', 'multiply', 'overlay', 'screen', 'soft-light'];

// SVG Icons (monochrome, 16×16)
const Icons = {
    image: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2" /><circle cx="5.5" cy="5.5" r="1.5" /><path d="M14 10l-3-3-5 5" /></svg>,
    package: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5l6-3 6 3-6 3z" /><path d="M2 5v6l6 3V8" /><path d="M14 5v6l-6 3V8" /></svg>,
    download: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13h10" /></svg>,
    video: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1.5" y="3" width="9" height="10" rx="1.5" /><path d="M10.5 6.5L14 4.5v7l-3.5-2" /></svg>,
    search: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>,
    undo: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 6l-3 3 3 3" /><path d="M1 9h9a4 4 0 0 0 0-8H8" /></svg>,
    redo: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 6l3 3-3 3" /><path d="M15 9H6a4 4 0 0 1 0-8h2" /></svg>,
    refresh: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 8a5.5 5.5 0 0 1 9.9-3.2M13.5 8a5.5 5.5 0 0 1-9.9 3.2" /><path d="M12.5 2v3h-3M3.5 14v-3h3" /></svg>,
};

function mid(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function qbez(p0: Point, cp: Point, p1: Point, t: number): Point {
    const it = 1 - t;
    return {
        x: it * it * p0.x + 2 * it * t * cp.x + t * t * p1.x,
        y: it * it * p0.y + 2 * it * t * cp.y + t * t * p1.y,
    };
}

/** Default edge CPs = midpoints (straight lines) */
function defaultEdgeCurves(quad: Point[]): [Point, Point, Point, Point] {
    const [tl, tr, br, bl] = quad;
    return [mid(tl, tr), mid(tr, br), mid(br, bl), mid(tl, bl)];
}

/** Edge endpoint pairs: [start, end] for top, right, bottom, left */
function edgeEndpoints(quad: Point[]): [Point, Point][] {
    const [tl, tr, br, bl] = quad;
    return [[tl, tr], [tr, br], [br, bl], [tl, bl]];
}

// Handle type
type HandleId = { type: 'corner'; index: number } | { type: 'edge'; index: number } | { type: 'quad' };

/** Point-in-polygon test (ray casting) */
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

export default function MockupEditor() {
    const {
        variations, mockupTemplates, generatedMockups,
        addMockupTemplate, removeMockupTemplate, updateMockupTemplate,
        setVariations, toggleVariationSelection, updateVariation,
        setGeneratedMockups, setStep, isCompositing, setIsCompositing, setError,
    } = useWorkflowStore();
    const addToast = useToastStore((s) => s.addToast);

    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
    const [dragActive, setDragActive] = useState(false);
    const [uploadingTemplates, setUploadingTemplates] = useState(false);
    const [uploadingDesigns, setUploadingDesigns] = useState(false);
    const [designDragActive, setDesignDragActive] = useState(false);
    const [selectedMockupIds, setSelectedMockupIds] = useState<Set<string>>(new Set());
    const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [zipUrl, setZipUrl] = useState<string | null>(null);
    const [removeBgVariationId, setRemoveBgVariationId] = useState<string | null>(null);
    const [seoMockupId, setSeoMockupId] = useState<string | null>(null);
    const [showBatchPreview, setShowBatchPreview] = useState(false);
    const [batchExcluded, setBatchExcluded] = useState<Set<string>>(new Set());

    // Quad placement state
    const [placingCorner, setPlacingCorner] = useState(0);
    const [corners, setCorners] = useState<Point[]>([]);
    const [edgeCPs, setEdgeCPs] = useState<[Point, Point, Point, Point] | null>(null);
    const [dragging, setDragging] = useState<HandleId | null>(null);

    // Drag-to-draw state
    const [dragStart, setDragStart] = useState<Point | null>(null);
    const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
    // Quad move state
    const [lastDragPos, setLastDragPos] = useState<Point | null>(null);

    // Blend controls
    const [blendMode, setBlendMode] = useState<MockupMask['blendMode']>('normal');
    const [fitMode, setFitMode] = useState<MockupMask['fitMode']>('contain');
    const [opacity, setOpacity] = useState(100);
    const [shadowEnabled, setShadowEnabled] = useState(false);
    const [shadowBlur, setShadowBlur] = useState(10);

    // Undo/Redo — use refs to avoid stale closures
    const [maskHistory, setMaskHistory] = useState<(MockupMask | null)[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const historyRef = useRef<{ history: (MockupMask | null)[]; index: number }>({ history: [], index: -1 });
    // Keep ref in sync
    historyRef.current = { history: maskHistory, index: historyIndex };

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const designInputRef = useRef<HTMLInputElement>(null);
    const imgCacheMap = useRef<Map<string, HTMLImageElement>>(new Map());
    const rafRef = useRef<number>(0);
    const canvasSizedRef = useRef(false);

    const MAX_CANVAS_DIM = 2000;

    const activeTemplate = mockupTemplates.find((t) => t.id === activeTemplateId);

    // Preload all template images into cache
    useEffect(() => {
        for (const t of mockupTemplates) {
            if (t.imageUrl && !imgCacheMap.current.has(t.imageUrl)) {
                const img = new Image();
                img.onload = () => imgCacheMap.current.set(t.imageUrl, img);
                img.src = t.imageUrl;
            }
        }
    }, [mockupTemplates]);
    const selectedVariations = variations.filter((v) => v.selected && v.imageUrl);

    const quadDone = corners.length === 4;

    // Build mask
    const buildMask = useCallback((): MockupMask => {
        const quad = corners as [Point, Point, Point, Point];
        const xs = quad.map(p => p.x);
        const ys = quad.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);

        // Check if edge CPs differ from default midpoints
        const defCPs = defaultEdgeCurves(corners);
        const hasCustomCurves = edgeCPs && edgeCPs.some((cp, i) =>
            Math.abs(cp.x - defCPs[i].x) > 1 || Math.abs(cp.y - defCPs[i].y) > 1
        );

        return {
            x: minX, y: minY,
            width: Math.max(...xs) - minX,
            height: Math.max(...ys) - minY,
            rotation: 0,
            mode: 'quad',
            quad,
            edgeCurves: hasCustomCurves ? edgeCPs! : undefined,
            fitMode,
            blendMode,
            opacity,
            shadow: shadowEnabled ? { blur: shadowBlur, color: 'rgba(0,0,0,0.5)' } : undefined,
        };
    }, [corners, edgeCPs, fitMode, blendMode, opacity, shadowEnabled, shadowBlur]);

    // Sync state when switching templates
    useEffect(() => {
        // Read directly from store to avoid stale closure
        const template = useWorkflowStore.getState().mockupTemplates.find((t) => t.id === activeTemplateId);
        const mask = template?.mask;
        if (mask && mask.mode === 'quad' && mask.quad) {
            setCorners([...mask.quad]);
            setEdgeCPs(mask.edgeCurves ? [...mask.edgeCurves] : defaultEdgeCurves(mask.quad));
            setPlacingCorner(4);
            setFitMode(mask.fitMode || 'contain');
            setBlendMode(mask.blendMode || 'normal');
            setOpacity(mask.opacity ?? 100);
            setShadowEnabled(!!mask.shadow);
            setShadowBlur(mask.shadow?.blur ?? 10);
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
            setFitMode(mask.fitMode || 'contain');
            setBlendMode(mask.blendMode || 'normal');
            setOpacity(mask.opacity ?? 100);
            setShadowEnabled(!!mask.shadow);
            setShadowBlur(mask.shadow?.blur ?? 10);
        } else {
            setCorners([]);
            setEdgeCPs(null);
            setPlacingCorner(0);
            setFitMode('contain');
            setBlendMode('normal');
            setOpacity(100);
            setShadowEnabled(false);
            setShadowBlur(10);
        }
        setMaskHistory(mask ? [mask] : []);
        setHistoryIndex(mask ? 0 : -1);
        canvasSizedRef.current = false;
        setDragStart(null);
        setDragCurrent(null);
        setDragging(null);
        setLastDragPos(null);
    }, [activeTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

    // History — read from ref to avoid stale closures
    const pushHistory = useCallback((mask: MockupMask | null) => {
        const { history, index } = historyRef.current;
        const next = [...history.slice(0, index + 1), mask].slice(-MAX_HISTORY);
        const newIdx = next.length - 1;
        setMaskHistory(next);
        setHistoryIndex(newIdx);
    }, []);

    const restoreMask = useCallback((mask: MockupMask | null) => {
        if (!activeTemplate) return;
        updateMockupTemplate(activeTemplate.id, { mask });
        if (mask?.quad) {
            setCorners([...mask.quad]);
            setEdgeCPs(mask.edgeCurves ? [...mask.edgeCurves] : defaultEdgeCurves(mask.quad));
            setPlacingCorner(4);
        } else {
            setCorners([]);
            setEdgeCPs(null);
            setPlacingCorner(0);
        }
    }, [activeTemplate, updateMockupTemplate]);

    const undo = useCallback(() => {
        const { history, index } = historyRef.current;
        if (index <= 0 || !activeTemplate) return;
        const newIdx = index - 1;
        setHistoryIndex(newIdx);
        restoreMask(history[newIdx]);
    }, [activeTemplate, restoreMask]);

    const redo = useCallback(() => {
        const { history, index } = historyRef.current;
        if (index >= history.length - 1 || !activeTemplate) return;
        const newIdx = index + 1;
        setHistoryIndex(newIdx);
        restoreMask(history[newIdx]);
    }, [activeTemplate, restoreMask]);

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

    const commitMask = useCallback(() => {
        if (!activeTemplate || corners.length < 4) return;
        const mask = buildMask();
        updateMockupTemplate(activeTemplate.id, { mask });
        pushHistory(mask);
    }, [activeTemplate, corners, buildMask, updateMockupTemplate, pushHistory]);

    // Update mask when blend/opacity/shadow change
    useEffect(() => {
        if (quadDone && activeTemplate) {
            const mask = buildMask();
            updateMockupTemplate(activeTemplate.id, { mask });
        }
    }, [fitMode, blendMode, opacity, shadowEnabled, shadowBlur]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- File naming ---
    const makeSafeFilename = (templateName: string, variationName: string) =>
        `${templateName}-${variationName}.png`.replace(/[^a-zA-Z0-9._-]/g, '_');

    const triggerDownload = (imageUrl: string, filename: string) => {
        if (!imageUrl) { addToast('error', 'Không có URL để tải'); return; }
        window.location.href = `/api/download/${encodeURIComponent(filename)}?source=${encodeURIComponent(imageUrl)}`;
    };

    const handleDownloadSelected = async () => {
        const toDownload = generatedMockups.filter((m) => selectedMockupIds.has(m.id) && m.imageUrl);
        if (toDownload.length === 0) return;
        if (toDownload.length === 1) {
            triggerDownload(toDownload[0].imageUrl, makeSafeFilename(toDownload[0].templateName, toDownload[0].variationName));
            return;
        }
        // Multiple files: if all are selected and zipUrl exists, use it directly
        if (zipUrl && toDownload.length === generatedMockups.filter(m => m.imageUrl).length) {
            triggerDownload(zipUrl, 'mockups.zip');
            return;
        }
        // Otherwise, build a zip client-side (fetch sequentially in batches to avoid timeouts)
        setDownloading(true);
        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            const BATCH = 3;
            let failed = 0;
            for (let i = 0; i < toDownload.length; i += BATCH) {
                const batch = toDownload.slice(i, i + BATCH);
                await Promise.all(batch.map(async (mockup) => {
                    try {
                        const res = await fetch(mockup.imageUrl);
                        if (!res.ok) { failed++; return; }
                        const blob = await res.blob();
                        if (blob.size === 0) { failed++; return; }
                        zip.file(makeSafeFilename(mockup.templateName, mockup.variationName), blob);
                    } catch {
                        failed++;
                    }
                }));
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const { saveAs } = await import('file-saver');
            saveAs(zipBlob, 'mockups.zip');
            if (failed > 0) addToast('warning', `${failed}/${toDownload.length} ảnh không tải được`);
        } catch (err) {
            addToast('error', `Tải ZIP thất bại: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally {
            setDownloading(false);
        }
    };

    const toggleMockupSelection = (id: string) => {
        setSelectedMockupIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAllMockups = () => {
        setSelectedMockupIds(new Set(generatedMockups.filter((m) => m.imageUrl).map((m) => m.id)));
    };

    // --- Template multi-select ---
    const toggleTemplateSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedTemplateIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAllTemplates = () => {
        setSelectedTemplateIds(new Set(mockupTemplates.map(t => t.id)));
    };

    const deselectAllTemplates = () => {
        setSelectedTemplateIds(new Set());
    };

    // Copy active template's mask to all selected templates
    const applyMaskToSelected = () => {
        if (!activeTemplate?.mask) {
            addToast('error', 'Template hiện tại chưa có mask');
            return;
        }
        const targets = mockupTemplates.filter(t => selectedTemplateIds.has(t.id) && t.id !== activeTemplateId);
        if (targets.length === 0) {
            addToast('error', 'Chưa chọn template nào để áp dụng');
            return;
        }
        for (const t of targets) {
            updateMockupTemplate(t.id, { mask: { ...activeTemplate.mask } });
        }
        addToast('success', `Đã áp dụng mask cho ${targets.length} template`);
    };

    // --- Upload (supports multiple files) ---
    const handleUploadTemplate = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) return;
        setUploadingTemplates(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const newTemplate = {
                id: uuidv4(),
                name: file.name.replace(/\.[^.]+$/, ''),
                imageUrl: data.url,
                mask: null,
            };
            addMockupTemplate(newTemplate);
            setActiveTemplateId(newTemplate.id);
        } catch (err) {
            addToast('error', `Upload failed: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally {
            setUploadingTemplates(false);
        }
    }, [addMockupTemplate, addToast]);

    const handleUploadMultiple = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        setUploadingTemplates(true);

        const uploads = imageFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return {
                id: uuidv4(),
                name: file.name.replace(/\.[^.]+$/, ''),
                imageUrl: data.url,
                mask: null,
            };
        });

        const results = await Promise.allSettled(uploads);
        let added = 0;
        let lastId: string | null = null;
        for (const r of results) {
            if (r.status === 'fulfilled') {
                addMockupTemplate(r.value);
                lastId = r.value.id;
                added++;
            }
        }
        if (lastId) setActiveTemplateId(lastId);
        const failed = results.filter(r => r.status === 'rejected').length;
        if (added > 0) addToast('success', `Đã thêm ${added} template`);
        if (failed > 0) addToast('error', `${failed} file upload thất bại`);
        setUploadingTemplates(false);
    }, [addMockupTemplate, addToast]);

    // --- Upload design images (add to variations) ---
    const handleUploadDesigns = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        setUploadingDesigns(true);

        const uploads = imageFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return {
                id: uuidv4(),
                styleId: 'custom',
                styleName: file.name.replace(/\.[^.]+$/, ''),
                imageUrl: data.url,
                selected: true,
                loading: false,
            } satisfies import('@/types').GeneratedVariation;
        });

        const results = await Promise.allSettled(uploads);
        const newVariations: import('@/types').GeneratedVariation[] = [];
        for (const r of results) {
            if (r.status === 'fulfilled') newVariations.push(r.value);
        }
        if (newVariations.length > 0) {
            setVariations([...variations, ...newVariations]);
            addToast('success', `Đã thêm ${newVariations.length} ảnh thiết kế`);
        }
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) addToast('error', `${failed} file upload thất bại`);
        setUploadingDesigns(false);
    }, [variations, setVariations, addToast]);

    // --- Canvas drawing ---
    const scaleRef = useRef(1);

    const drawCanvas = useCallback(() => {
        if (!activeTemplate || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = (img: HTMLImageElement) => {
            // Only resize canvas once per image
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

            // Scale context for drawing overlay (corners, edges etc use original coords)
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
                ctx.restore(); // drag preview save
                ctx.restore(); // scale save
                return;
            }

            if (corners.length === 0) { ctx.restore(); return; } // scale save

            ctx.save();

            // Draw edges (bezier curves if quadDone + edgeCPs, else straight)
            ctx.strokeStyle = 'rgba(0, 230, 138, 0.8)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 4]);

            if (corners.length >= 2 && quadDone && edgeCPs) {
                // Draw 4 bezier edges
                const edges = edgeEndpoints(corners);
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                // top: TL→TR
                ctx.quadraticCurveTo(edgeCPs[0].x, edgeCPs[0].y, corners[1].x, corners[1].y);
                // right: TR→BR
                ctx.quadraticCurveTo(edgeCPs[1].x, edgeCPs[1].y, corners[2].x, corners[2].y);
                // bottom: BR→BL
                ctx.quadraticCurveTo(edgeCPs[2].x, edgeCPs[2].y, corners[3].x, corners[3].y);
                // left: BL→TL
                ctx.quadraticCurveTo(edgeCPs[3].x, edgeCPs[3].y, corners[0].x, corners[0].y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(0, 230, 138, 0.12)';
                ctx.fill();
                ctx.stroke();

                // Draw control point tangent lines (dashed, thinner)
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

            // Draw edge curve handles (diamond shape)
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

                    // Label
                    ctx.fillStyle = '#333';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(EDGE_LABELS[i], cp.x, cp.y);
                });
            }

            ctx.restore(); // overlay save
            ctx.restore(); // scale save
        };

        const cachedImg = imgCacheMap.current.get(activeTemplate.imageUrl);
        if (cachedImg) {
            draw(cachedImg);
        } else {
            const img = new Image();
            img.onload = () => { imgCacheMap.current.set(activeTemplate.imageUrl, img); draw(img); };
            img.src = activeTemplate.imageUrl;
        }
    }, [activeTemplate, corners, edgeCPs, dragging, quadDone, dragStart, dragCurrent]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    // Coord helper
    // Map client coords to original image coords (not scaled canvas coords)
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

    const findNearHandle = useCallback((p: Point): HandleId | null => {
        const canvas = canvasRef.current;
        const scale = canvas ? canvas.width / canvas.getBoundingClientRect().width : 1;
        const hitR = CORNER_HIT_RADIUS * scale;

        // Check corners first (higher priority)
        for (let i = 0; i < corners.length; i++) {
            const dx = corners[i].x - p.x, dy = corners[i].y - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < hitR) return { type: 'corner', index: i };
        }
        // Check edge CPs
        if (edgeCPs) {
            for (let i = 0; i < edgeCPs.length; i++) {
                const dx = edgeCPs[i].x - p.x, dy = edgeCPs[i].y - p.y;
                if (Math.sqrt(dx * dx + dy * dy) < hitR) return { type: 'edge', index: i };
            }
        }
        // Check if inside quad (for move)
        if (corners.length === 4 && pointInQuad(p, corners)) {
            return { type: 'quad' };
        }
        return null;
    }, [corners, edgeCPs]);

    // Directly build & save mask from given corners (avoids stale closure issue)
    const commitMaskDirect = useCallback((quadCorners: Point[], edgeCurvesVal: [Point, Point, Point, Point]) => {
        if (!activeTemplate || quadCorners.length < 4) return;
        const quad = quadCorners as [Point, Point, Point, Point];
        const xs = quad.map(p => p.x);
        const ys = quad.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const defCPs = defaultEdgeCurves(quadCorners);
        const hasCustomCurves = edgeCurvesVal.some((cp, i) =>
            Math.abs(cp.x - defCPs[i].x) > 1 || Math.abs(cp.y - defCPs[i].y) > 1
        );
        const mask: MockupMask = {
            x: minX, y: minY,
            width: Math.max(...xs) - minX,
            height: Math.max(...ys) - minY,
            rotation: 0,
            mode: 'quad',
            quad,
            edgeCurves: hasCustomCurves ? edgeCurvesVal : undefined,
            fitMode,
            blendMode,
            opacity,
            shadow: shadowEnabled ? { blur: shadowBlur, color: 'rgba(0,0,0,0.5)' } : undefined,
        };
        updateMockupTemplate(activeTemplate.id, { mask });
        pushHistory(mask);
    }, [activeTemplate, fitMode, blendMode, opacity, shadowEnabled, shadowBlur, updateMockupTemplate, pushHistory]);

    const handlePointerDown = (clientX: number, clientY: number) => {
        const coords = getCoords(clientX, clientY);

        if (quadDone) {
            const handle = findNearHandle(coords);
            if (handle) {
                setDragging(handle);
                if (handle.type === 'quad') setLastDragPos(coords);
            }
        } else {
            // Start drag-to-draw (record start point)
            if (corners.length === 0) {
                setDragStart(coords);
                setDragCurrent(coords);
            } else {
                // Fallback: click-to-place individual corners
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
    };

    const handlePointerMove = (clientX: number, clientY: number) => {
        const coords = getCoords(clientX, clientY);

        // Drag-to-draw preview
        if (dragStart && !quadDone) {
            setDragCurrent(coords);
            return;
        }

        // Update cursor based on hover
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
    };

    const MIN_DRAG_SIZE = 20;

    const handlePointerUp = () => {
        // Drag-to-draw completion
        if (dragStart && dragCurrent && !quadDone) {
            const dx = Math.abs(dragCurrent.x - dragStart.x);
            const dy = Math.abs(dragCurrent.y - dragStart.y);
            if (dx >= MIN_DRAG_SIZE && dy >= MIN_DRAG_SIZE) {
                // Create rectangle from drag
                const minX = Math.min(dragStart.x, dragCurrent.x);
                const minY = Math.min(dragStart.y, dragCurrent.y);
                const maxX = Math.max(dragStart.x, dragCurrent.x);
                const maxY = Math.max(dragStart.y, dragCurrent.y);
                const newCorners: Point[] = [
                    { x: minX, y: minY }, // TL
                    { x: maxX, y: minY }, // TR
                    { x: maxX, y: maxY }, // BR
                    { x: minX, y: maxY }, // BL
                ];
                setCorners(newCorners);
                setPlacingCorner(4);
                const newEdgeCPs = defaultEdgeCurves(newCorners);
                setEdgeCPs(newEdgeCPs);
                commitMaskDirect(newCorners, newEdgeCPs);
            } else {
                // Too small — treat as single click, place first corner
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
    };

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerDown(e.clientX, e.clientY);
    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (rafRef.current) return;
        const cx = e.clientX, cy = e.clientY;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            handlePointerMove(cx, cy);
        });
    };
    const handleCanvasMouseUp = () => handlePointerUp();

    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault(); handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (rafRef.current) return;
        const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            handlePointerMove(cx, cy);
        });
    };
    const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault(); handlePointerUp();
    };

    const handleResetMask = () => {
        setCorners([]);
        setEdgeCPs(null);
        setPlacingCorner(0);
        setDragging(null);
        setDragStart(null);
        setDragCurrent(null);
        setLastDragPos(null);
        if (activeTemplate) updateMockupTemplate(activeTemplate.id, { mask: null });
    };

    const handleResetCurves = () => {
        if (!quadDone) return;
        setEdgeCPs(defaultEdgeCurves(corners));
        setTimeout(() => commitMask(), 0);
    };

    // --- Batch preview helpers ---
    const openBatchPreview = () => {
        setBatchExcluded(new Set());
        setShowBatchPreview(true);
    };

    const getBatchCombos = () => {
        const templatesWithMask = mockupTemplates.filter((t) => t.mask);
        return templatesWithMask.flatMap((t) =>
            selectedVariations.map((v) => ({
                key: `${t.id}__${v.id}`,
                template: t,
                variation: v,
            }))
        );
    };

    const toggleBatchItem = (key: string) => {
        setBatchExcluded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    // --- Generate ---
    const handleGenerateMockups = async (excludedKeys?: Set<string>) => {
        const templatesWithMask = mockupTemplates.filter((t) => t.mask);
        if (templatesWithMask.length === 0 || selectedVariations.length === 0) return;

        setShowBatchPreview(false);
        setIsCompositing(true);
        setError(null);

        const items = templatesWithMask.flatMap((t) =>
            selectedVariations
                .filter((v) => !excludedKeys || !excludedKeys.has(`${t.id}__${v.id}`))
                .map((v) => ({
                    mockupImagePath: t.imageUrl,
                    designImagePath: v.imageUrl,
                    mask: t.mask,
                    templateName: t.name,
                    variationName: v.styleName,
                }))
        );

        if (items.length === 0) return;

        try {
            const res = await fetch('/api/mockup/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setGeneratedMockups(data.results);
            if (data.zipUrl) setZipUrl(data.zipUrl);
            addToast('success', `Đã tạo ${data.results.length} mockup!`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Mockup generation failed';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsCompositing(false);
        }
    };

    const readyTemplateCount = mockupTemplates.filter((t) => t.mask).length;
    const selectedMockupCount = selectedMockupIds.size;

    return (
        <div className="mockup-container">
            <div className="mockup-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn-ghost" onClick={() => setStep('variations')}>← Quay lại</button>
                    <span className="badge">{selectedVariations.length} biến thể đã chọn</span>
                </div>
            </div>

            <div className="mockup-layout">
                <div className="mockup-sidebar">
                    <h3>Mockup Templates</h3>
                    <div
                        className={`mockup-upload-mini ${dragActive ? 'drag-active' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={(e) => {
                            e.preventDefault(); setDragActive(false);
                            if (e.dataTransfer.files.length > 1) {
                                handleUploadMultiple(e.dataTransfer.files);
                            } else {
                                const file = e.dataTransfer.files[0];
                                if (file) handleUploadTemplate(file);
                            }
                        }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => {
                            const files = e.target.files;
                            if (!files) return;
                            if (files.length > 1) {
                                handleUploadMultiple(files);
                            } else if (files[0]) {
                                handleUploadTemplate(files[0]);
                            }
                            e.target.value = '';
                        }} hidden />
                        {uploadingTemplates ? <><span className="spinner-sm" /> Đang upload...</> : '+ Thêm mockup template (chọn nhiều)'}
                    </div>

                    {/* Batch actions for templates */}
                    {mockupTemplates.length > 1 && (
                        <div style={{
                            display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8,
                            padding: '6px 0', borderBottom: '1px solid var(--border, #333)',
                        }}>
                            <button className="btn-ghost-sm" onClick={selectAllTemplates} style={{ fontSize: 11 }}>
                                Chọn tất cả
                            </button>
                            <button className="btn-ghost-sm" onClick={deselectAllTemplates} style={{ fontSize: 11 }}>
                                Bỏ chọn
                            </button>
                            {selectedTemplateIds.size > 0 && activeTemplate?.mask && (
                                <button
                                    className="btn-ghost-sm"
                                    onClick={applyMaskToSelected}
                                    style={{ fontSize: 11, color: 'var(--accent, #00e68a)' }}
                                    title="Copy mask từ template đang active sang các template đã chọn"
                                >
                                    Apply mask → {selectedTemplateIds.size} selected
                                </button>
                            )}
                        </div>
                    )}

                    <div className="template-list">
                        {mockupTemplates.map((t) => (
                            <div
                                key={t.id}
                                className={`template-item ${activeTemplateId === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTemplateId(t.id)}
                            >
                                <div
                                    className={`checkbox ${selectedTemplateIds.has(t.id) ? 'checked' : ''}`}
                                    onClick={(e) => toggleTemplateSelection(t.id, e)}
                                    style={{ flexShrink: 0, width: 20, height: 20, fontSize: 12 }}
                                >
                                    {selectedTemplateIds.has(t.id) && '✓'}
                                </div>
                                <img src={t.imageUrl} alt={t.name} />
                                <div className="template-item-info">
                                    <span className="template-name">{t.name}</span>
                                    <span className={`template-status ${t.mask ? 'has-mask' : ''}`}>
                                        {t.mask ? '✅ Mask defined' : '⚠️ No mask'}
                                    </span>
                                </div>
                                <button className="btn-icon-sm" onClick={(e) => {
                                    e.stopPropagation();
                                    removeMockupTemplate(t.id);
                                    if (activeTemplateId === t.id) setActiveTemplateId(null);
                                    setSelectedTemplateIds(prev => { const n = new Set(prev); n.delete(t.id); return n; });
                                }}>✕</button>
                            </div>
                        ))}
                    </div>

                    <h3>Ảnh thiết kế ({selectedVariations.length}/{variations.length})</h3>
                    <div
                        className={`mockup-upload-mini ${designDragActive ? 'drag-active' : ''}`}
                        onClick={() => designInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDesignDragActive(true); }}
                        onDragLeave={() => setDesignDragActive(false)}
                        onDrop={(e) => {
                            e.preventDefault(); setDesignDragActive(false);
                            if (e.dataTransfer.files.length > 0) handleUploadDesigns(e.dataTransfer.files);
                        }}
                        style={{ marginBottom: 8 }}
                    >
                        <input ref={designInputRef} type="file" accept="image/*" multiple onChange={(e) => {
                            if (e.target.files) handleUploadDesigns(e.target.files);
                            e.target.value = '';
                        }} hidden />
                        {uploadingDesigns ? <><span className="spinner-sm" /> Đang upload...</> : '+ Thêm ảnh thiết kế'}
                    </div>
                    <div className="selected-variations-mini">
                        {variations.filter(v => v.imageUrl).map((v) => (
                            <div
                                key={v.id}
                                className="mini-variation"
                                style={{
                                    opacity: v.selected ? 1 : 0.4,
                                    cursor: 'pointer',
                                    outline: v.selected ? '2px solid var(--accent, #00e68a)' : '2px solid transparent',
                                    borderRadius: 6,
                                    transition: 'opacity 0.15s, outline-color 0.15s',
                                    position: 'relative',
                                }}
                            >
                                <img
                                    src={v.imageUrl}
                                    alt={v.styleName}
                                    onClick={() => toggleVariationSelection(v.id)}
                                    title={v.selected ? 'Click để bỏ chọn' : 'Click để chọn'}
                                />
                                <span onClick={() => toggleVariationSelection(v.id)}>{v.styleName}</span>
                                <button
                                    className="btn-icon-sm"
                                    onClick={(e) => { e.stopPropagation(); setRemoveBgVariationId(v.id); }}
                                    title="Tách nền"
                                    style={{ fontSize: 11, padding: '2px 4px', flexShrink: 0 }}
                                >
                                    ✂️
                                </button>
                                <button
                                    className="btn-icon-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setVariations(variations.filter(x => x.id !== v.id));
                                    }}
                                    title="Xoá"
                                    style={{ fontSize: 11, padding: '2px 4px', flexShrink: 0 }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mockup-canvas-area">
                    {activeTemplate ? (
                        <>
                            <p className="canvas-instructions">
                                {!quadDone
                                    ? 'Kéo để vẽ vùng mockup, hoặc click 4 góc (TL → TR → BR → BL)'
                                    : 'Kéo góc xanh để chỉnh. Kéo handle vàng để uốn cong. Kéo bên trong để di chuyển.'}
                            </p>

                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div className="undo-redo-bar">
                                    <button className="btn-icon" title="Undo (Ctrl+Z)" onClick={undo} disabled={historyIndex <= 0}>{Icons.undo}</button>
                                    <button className="btn-icon" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={historyIndex >= maskHistory.length - 1}>{Icons.redo}</button>
                                    <button className="btn-ghost-sm" onClick={handleResetMask}>Reset</button>
                                    {quadDone && <button className="btn-ghost-sm" onClick={handleResetCurves}>Reset curves</button>}
                                    {quadDone && selectedTemplateIds.size > 0 && (
                                        <button
                                            className="btn-ghost-sm"
                                            onClick={applyMaskToSelected}
                                            style={{ color: 'var(--accent, #00e68a)', fontWeight: 600 }}
                                        >
                                            Apply mask → {selectedTemplateIds.size} template
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="canvas-wrapper">
                                <canvas
                                    ref={canvasRef}
                                    onMouseDown={handleCanvasMouseDown}
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp}
                                    onMouseLeave={handleCanvasMouseUp}
                                    onTouchStart={handleTouchStart}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={handleTouchEnd}
                                    style={{ cursor: quadDone ? 'default' : 'crosshair', touchAction: 'none' }}
                                />
                            </div>

                            {quadDone && (
                                <div className="blend-controls" style={{
                                    display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
                                    marginTop: 12, padding: '12px 16px',
                                    background: 'var(--surface-2, #1a1a2e)', borderRadius: 8,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label style={{ fontSize: 13, opacity: 0.8 }}>Fit:</label>
                                        <select
                                            value={fitMode}
                                            onChange={(e) => setFitMode(e.target.value as MockupMask['fitMode'])}
                                            style={{
                                                background: 'var(--surface-3, #252542)', color: 'inherit',
                                                border: '1px solid var(--border, #333)', borderRadius: 4, padding: '4px 8px',
                                            }}
                                        >
                                            <option value="contain">Contain (giữ tỉ lệ)</option>
                                            <option value="fill">Fill (kéo giãn)</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label style={{ fontSize: 13, opacity: 0.8 }}>Blend:</label>
                                        <select
                                            value={blendMode}
                                            onChange={(e) => setBlendMode(e.target.value as MockupMask['blendMode'])}
                                            style={{
                                                background: 'var(--surface-3, #252542)', color: 'inherit',
                                                border: '1px solid var(--border, #333)', borderRadius: 4, padding: '4px 8px',
                                            }}
                                        >
                                            {BLEND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label style={{ fontSize: 13, opacity: 0.8 }}>Opacity:</label>
                                        <input type="range" min="0" max="100" value={opacity}
                                            onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: 100 }} />
                                        <span style={{ fontSize: 12, minWidth: 32 }}>{opacity}%</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <label style={{ fontSize: 13, opacity: 0.8 }}>
                                            <input type="checkbox" checked={shadowEnabled}
                                                onChange={(e) => setShadowEnabled(e.target.checked)} style={{ marginRight: 4 }} />
                                            Shadow
                                        </label>
                                        {shadowEnabled && (
                                            <>
                                                <input type="range" min="0" max="50" value={shadowBlur}
                                                    onChange={(e) => setShadowBlur(Number(e.target.value))} style={{ width: 80 }} />
                                                <span style={{ fontSize: 12 }}>{shadowBlur}px</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="canvas-empty">
                            <h3>Chọn hoặc thêm mockup template</h3>
                            <p>Upload ảnh mockup rồi click 4 góc để đặt vùng thiết kế. Kéo handle vàng để uốn cong.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="mockup-generate-bar">
                <button
                    className="btn-primary btn-lg"
                    disabled={readyTemplateCount === 0 || selectedVariations.length === 0 || isCompositing}
                    onClick={openBatchPreview}
                >
                    {isCompositing ? <><span className="spinner-sm" /> Đang tạo mockup...</>
                        : `Tạo ${readyTemplateCount * selectedVariations.length} mockup`}
                </button>
            </div>

            {generatedMockups.length > 0 && (
                <div className="generated-mockups-section">
                    <div className="generated-header">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{Icons.image} Mockups ({generatedMockups.length})</h3>
                        <div className="generated-header-actions">
                            <button className="btn-ghost-sm" onClick={selectAllMockups}>Chọn tất cả</button>
                            <button className="btn-ghost-sm" onClick={() => setSelectedMockupIds(new Set())}>Bỏ chọn</button>
                            {selectedMockupCount > 0 && (
                                <button className="btn-primary" onClick={handleDownloadSelected} disabled={downloading}>
                                    {downloading ? <><span className="spinner-sm" /> Đang tải...</> : <>{Icons.download} Tải {selectedMockupCount} ảnh</>}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="generated-grid">
                        {generatedMockups.map((mockup) => (
                            <div key={mockup.id} className={`generated-card ${selectedMockupIds.has(mockup.id) ? 'selected' : ''}`}>
                                {mockup.imageUrl ? (
                                    <>
                                        <div className="generated-image-wrap"
                                            onClick={() => setLightboxImage({ url: mockup.imageUrl, alt: `${mockup.templateName} - ${mockup.variationName}` })}>
                                            <img src={mockup.imageUrl} alt={`${mockup.templateName} - ${mockup.variationName}`} />
                                            <div className="zoom-overlay"><span>{Icons.search}</span></div>
                                        </div>
                                        <div className="generated-card-footer">
                                            <div className="generated-card-info">
                                                <span>{mockup.templateName}</span>
                                                <span className="dot">·</span>
                                                <span>{mockup.variationName}</span>
                                            </div>
                                            <div className="generated-card-actions">
                                                <button className="btn-icon-sm" title="Tạo Video" onClick={(e) => {
                                                    e.stopPropagation();
                                                    const { setVideoGeneration, setStep } = useWorkflowStore.getState();
                                                    setVideoGeneration({
                                                        id: uuidv4(),
                                                        mockupId: mockup.id,
                                                        mockupImageUrl: mockup.imageUrl,
                                                        prompt: '',
                                                        status: 'pending',
                                                    });
                                                    setStep('video');
                                                }}>{Icons.video}</button>
                                                <button className="btn-icon-sm" title="SEO Title & Description" onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSeoMockupId(mockup.id);
                                                }} style={mockup.seo?.status === 'done' ? { color: 'var(--accent, #00e68a)' } : undefined}>
                                                    {'📝'}
                                                </button>
                                                <button className="btn-icon-sm" title="Download" onClick={(e) => {
                                                    e.stopPropagation();
                                                    triggerDownload(mockup.imageUrl, makeSafeFilename(mockup.templateName, mockup.variationName));
                                                }}>{Icons.download}</button>
                                                <div className={`checkbox ${selectedMockupIds.has(mockup.id) ? 'checked' : ''}`}
                                                    onClick={() => toggleMockupSelection(mockup.id)}>
                                                    {selectedMockupIds.has(mockup.id) && '✓'}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="variation-error">
                                        <span>⚠️</span>
                                        <p>{mockup.error || 'Lỗi'}</p>
                                        <button
                                            className="btn-ghost-sm"
                                            style={{ marginTop: 4 }}
                                            onClick={() => handleGenerateMockups()}
                                        >
                                            Tạo lại
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {lightboxImage && (
                <Lightbox imageUrl={lightboxImage.url} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
            )}

            {showBatchPreview && (() => {
                const combos = getBatchCombos();
                const activeCount = combos.filter(c => !batchExcluded.has(c.key)).length;
                return (
                    <div className="batch-preview-overlay" onClick={() => setShowBatchPreview(false)}>
                        <div className="batch-preview-modal" onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Preview mockup combinations</h3>
                                <button className="btn-icon-sm" onClick={() => setShowBatchPreview(false)}>✕</button>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                                Bỏ chọn combo bạn không muốn tạo. Click vào ảnh để toggle.
                            </p>
                            <div className="batch-preview-grid">
                                {combos.map(({ key, template, variation }) => {
                                    const isChecked = !batchExcluded.has(key);
                                    return (
                                        <div
                                            key={key}
                                            className={`batch-preview-item ${isChecked ? 'checked' : ''}`}
                                            onClick={() => toggleBatchItem(key)}
                                        >
                                            {isChecked && <div className="batch-preview-check">✓</div>}
                                            <img src={template.imageUrl} alt={template.name} />
                                            <div className="batch-preview-item-label">
                                                {template.name} × {variation.styleName}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button className="btn-secondary" onClick={() => setShowBatchPreview(false)}>Huỷ</button>
                                <button
                                    className="btn-primary"
                                    disabled={activeCount === 0}
                                    onClick={() => handleGenerateMockups(batchExcluded)}
                                >
                                    Xác nhận tạo {activeCount} mockup
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {removeBgVariationId && (() => {
                const v = variations.find(x => x.id === removeBgVariationId);
                if (!v) return null;
                return (
                    <RemoveBgPanel
                        imageUrl={v.imageUrl}
                        onResult={(newUrl) => {
                            updateVariation(v.id, { imageUrl: newUrl });
                            addToast('success', `Đã tách nền: ${v.styleName}`);
                        }}
                        onClose={() => setRemoveBgVariationId(null)}
                    />
                );
            })()}

            {seoMockupId && (() => {
                const m = generatedMockups.find(x => x.id === seoMockupId);
                if (!m) return null;
                return (
                    <SEOPanel
                        mockup={m}
                        onClose={() => setSeoMockupId(null)}
                    />
                );
            })()}
        </div>
    );
}
