'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import Lightbox from './Lightbox';
import RemoveBgPanel from './RemoveBgPanel';
import SEOPanel from './SEOPanel';
import { Icons } from './icons';
import type { MockupMask, Point } from '@/types';

import { useQuadInteraction } from '@/hooks/useQuadInteraction';
import { useMaskHistory } from '@/hooks/useMaskHistory';

import TemplatePanel from './mockup/TemplatePanel';
import VariationsPanel from './mockup/VariationsPanel';
import BlendControlsPanel from './mockup/BlendControlsPanel';
import GeneratedMockupsGrid from './mockup/GeneratedMockupsGrid';
import BatchPreviewModal from './mockup/BatchPreviewModal';

function mid(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function defaultEdgeCurves(quad: Point[]): [Point, Point, Point, Point] {
    const [tl, tr, br, bl] = quad;
    return [mid(tl, tr), mid(tr, br), mid(br, bl), mid(tl, bl)];
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
    const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
    const [removeBgVariationId, setRemoveBgVariationId] = useState<string | null>(null);
    const [seoMockupId, setSeoMockupId] = useState<string | null>(null);
    const [showBatchPreview, setShowBatchPreview] = useState(false);

    // Blend controls
    const [fitMode, setFitMode] = useState<MockupMask['fitMode']>('contain');
    const [blendMode, setBlendMode] = useState<MockupMask['blendMode']>('normal');
    const [opacity, setOpacity] = useState(100);
    const [shadowEnabled, setShadowEnabled] = useState(false);
    const [shadowBlur, setShadowBlur] = useState(10);

    const activeTemplate = mockupTemplates.find((t) => t.id === activeTemplateId);
    const selectedVariations = variations.filter((v) => v.selected && v.imageUrl);

    // Canvas ref + coord helpers (shared between canvas drawing and interaction)
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const scaleRef = useRef(1);
    const imgCacheMap = useRef<Map<string, HTMLImageElement>>(new Map());
    const canvasSizedRef = useRef(false);
    const MAX_CANVAS_DIM = 2000;

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

    // We need commitMask/commitMaskDirect to be defined before interaction,
    // but they depend on interaction.corners/edgeCPs. Use refs to break the cycle.
    const cornersRef = useRef<Point[]>([]);
    const edgeCPsRef = useRef<[Point, Point, Point, Point] | null>(null);

    const buildMaskFromState = useCallback((corners: Point[], edgeCPs: [Point, Point, Point, Point] | null): MockupMask => {
        const quad = corners as [Point, Point, Point, Point];
        const xs = quad.map(p => p.x);
        const ys = quad.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
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
    }, [fitMode, blendMode, opacity, shadowEnabled, shadowBlur]);

    // Forward-declared via ref so interaction can call them without circular deps
    const pushHistoryRef = useRef<(mask: MockupMask | null) => void>(() => {});

    const commitMask = useCallback(() => {
        if (!activeTemplate || cornersRef.current.length < 4) return;
        const mask = buildMaskFromState(cornersRef.current, edgeCPsRef.current);
        updateMockupTemplate(activeTemplate.id, { mask });
        pushHistoryRef.current(mask);
    }, [activeTemplate, buildMaskFromState, updateMockupTemplate]);

    const commitMaskDirect = useCallback((quadCorners: Point[], edgeCurvesVal: [Point, Point, Point, Point]) => {
        if (!activeTemplate || quadCorners.length < 4) return;
        const mask = buildMaskFromState(quadCorners, edgeCurvesVal);
        updateMockupTemplate(activeTemplate.id, { mask });
        pushHistoryRef.current(mask);
    }, [activeTemplate, buildMaskFromState, updateMockupTemplate]);

    // Interaction hook
    const interaction = useQuadInteraction({
        getCoords,
        canvasRef,
        scaleRef,
        activeTemplateId,
        commitMask,
        commitMaskDirect,
    });

    // Keep refs in sync
    cornersRef.current = interaction.corners;
    edgeCPsRef.current = interaction.edgeCPs;

    // History hook
    const history = useMaskHistory({
        activeTemplateId,
        updateMockupTemplate,
        setCorners: interaction.setCorners,
        setEdgeCPs: interaction.setEdgeCPs,
        setPlacingCorner: interaction.setPlacingCorner,
    });

    pushHistoryRef.current = history.pushHistory;

    // Canvas drawing
    const drawCanvas = useCallback(() => {
        if (!activeTemplate || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const corners = interaction.corners;
        const edgeCPs = interaction.edgeCPs;
        const dragging = interaction.dragging;
        const quadDone = interaction.quadDone;
        const dragStart = interaction.dragStart;
        const dragCurrent = interaction.dragCurrent;

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
            ctx.strokeStyle = 'rgba(0, 230, 138, 0.8)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 4]);

            if (corners.length >= 2 && quadDone && edgeCPs) {
                const edgeEndpoints = (q: Point[]): [Point, Point][] => {
                    const [tl, tr, br, bl] = q;
                    return [[tl, tr], [tr, br], [br, bl], [tl, bl]];
                };
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

            const CORNER_DRAW_RADIUS = 8;
            const EDGE_DRAW_RADIUS = 6;
            const CORNER_LABELS = ['1', '2', '3', '4'];
            const EDGE_LABELS = ['T', 'R', 'B', 'L'];

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

        const cachedImg = imgCacheMap.current.get(activeTemplate.imageUrl);
        if (cachedImg) {
            draw(cachedImg);
        } else {
            const img = new Image();
            img.onload = () => { imgCacheMap.current.set(activeTemplate.imageUrl, img); draw(img); };
            img.src = activeTemplate.imageUrl;
        }
    }, [activeTemplate, interaction.corners, interaction.edgeCPs, interaction.dragging, interaction.quadDone, interaction.dragStart, interaction.dragCurrent]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    // Preload template images
    useEffect(() => {
        for (const t of mockupTemplates) {
            if (t.imageUrl && !imgCacheMap.current.has(t.imageUrl)) {
                const img = new Image();
                img.onload = () => imgCacheMap.current.set(t.imageUrl, img);
                img.src = t.imageUrl;
            }
        }
    }, [mockupTemplates]);

    // Sync state when switching templates
    useEffect(() => {
        const template = useWorkflowStore.getState().mockupTemplates.find((t) => t.id === activeTemplateId);
        const mask = template?.mask;
        interaction.restoreFromMask(mask ?? null);
        if (mask) {
            setFitMode(mask.fitMode || 'contain');
            setBlendMode(mask.blendMode || 'normal');
            setOpacity(mask.opacity ?? 100);
            setShadowEnabled(!!mask.shadow);
            setShadowBlur(mask.shadow?.blur ?? 10);
        } else {
            setFitMode('contain');
            setBlendMode('normal');
            setOpacity(100);
            setShadowEnabled(false);
            setShadowBlur(10);
        }
        history.resetHistory(mask ?? null);
        canvasSizedRef.current = false;
    }, [activeTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Update mask when blend/opacity/shadow change
    useEffect(() => {
        if (interaction.quadDone && activeTemplate) {
            const mask = buildMaskFromState(interaction.corners, interaction.edgeCPs);
            updateMockupTemplate(activeTemplate.id, { mask });
        }
    }, [fitMode, blendMode, opacity, shadowEnabled, shadowBlur]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const handleResetMask = () => {
        interaction.handleResetMask();
        if (activeTemplate) updateMockupTemplate(activeTemplate.id, { mask: null });
    };

    const handleResetCurves = () => {
        interaction.handleResetCurves();
        setTimeout(() => commitMask(), 0);
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
                    <TemplatePanel
                        mockupTemplates={mockupTemplates}
                        activeTemplateId={activeTemplateId}
                        selectedTemplateIds={selectedTemplateIds}
                        addMockupTemplate={addMockupTemplate}
                        removeMockupTemplate={removeMockupTemplate}
                        updateMockupTemplate={updateMockupTemplate}
                        setActiveTemplateId={setActiveTemplateId}
                        setSelectedTemplateIds={setSelectedTemplateIds}
                        applyMaskToSelected={applyMaskToSelected}
                    />

                    <VariationsPanel
                        variations={variations}
                        setVariations={setVariations}
                        toggleVariationSelection={toggleVariationSelection}
                        setRemoveBgVariationId={setRemoveBgVariationId}
                    />
                </div>

                <div className="mockup-canvas-area">
                    {activeTemplate ? (
                        <>
                            <p className="canvas-instructions">
                                {!interaction.quadDone
                                    ? 'Kéo để vẽ vùng mockup, hoặc click 4 góc (TL → TR → BR → BL)'
                                    : 'Kéo góc xanh để chỉnh. Kéo handle vàng để uốn cong. Kéo bên trong để di chuyển.'}
                            </p>

                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div className="undo-redo-bar">
                                    <button className="btn-icon" title="Undo (Ctrl+Z)" onClick={history.undo} disabled={history.historyIndex <= 0}>{Icons.undo}</button>
                                    <button className="btn-icon" title="Redo (Ctrl+Shift+Z)" onClick={history.redo} disabled={history.historyIndex >= history.maskHistory.length - 1}>{Icons.redo}</button>
                                    <button className="btn-ghost-sm" onClick={handleResetMask}>Reset</button>
                                    {interaction.quadDone && <button className="btn-ghost-sm" onClick={handleResetCurves}>Reset curves</button>}
                                    {interaction.quadDone && selectedTemplateIds.size > 0 && (
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
                                    onMouseDown={interaction.handleCanvasMouseDown}
                                    onMouseMove={interaction.handleCanvasMouseMove}
                                    onMouseUp={interaction.handleCanvasMouseUp}
                                    onMouseLeave={interaction.handleCanvasMouseUp}
                                    onTouchStart={interaction.handleTouchStart}
                                    onTouchMove={interaction.handleTouchMove}
                                    onTouchEnd={interaction.handleTouchEnd}
                                    style={{ cursor: interaction.quadDone ? 'default' : 'crosshair', touchAction: 'none' }}
                                />
                            </div>

                            {interaction.quadDone && (
                                <BlendControlsPanel
                                    fitMode={fitMode} setFitMode={setFitMode}
                                    blendMode={blendMode} setBlendMode={setBlendMode}
                                    opacity={opacity} setOpacity={setOpacity}
                                    shadowEnabled={shadowEnabled} setShadowEnabled={setShadowEnabled}
                                    shadowBlur={shadowBlur} setShadowBlur={setShadowBlur}
                                />
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
                    onClick={() => { setShowBatchPreview(true); }}
                >
                    {isCompositing ? <><span className="spinner-sm" /> Đang tạo mockup...</>
                        : `Tạo ${readyTemplateCount * selectedVariations.length} mockup`}
                </button>
            </div>

            {generatedMockups.length > 0 && (
                <GeneratedMockupsGrid
                    generatedMockups={generatedMockups}
                    setLightboxImage={setLightboxImage}
                    setSeoMockupId={setSeoMockupId}
                    onRetry={() => handleGenerateMockups()}
                />
            )}

            {lightboxImage && (
                <Lightbox imageUrl={lightboxImage.url} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
            )}

            {showBatchPreview && (
                <BatchPreviewModal
                    mockupTemplates={mockupTemplates}
                    selectedVariations={selectedVariations}
                    onClose={() => setShowBatchPreview(false)}
                    onGenerate={(excluded) => handleGenerateMockups(excluded)}
                />
            )}

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
