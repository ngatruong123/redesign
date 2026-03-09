'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import Lightbox from './Lightbox';
import RemoveBgPanel from './RemoveBgPanel';
import dynamic from 'next/dynamic';
const SEOPanel = dynamic(() => import('./SEOPanel'), { ssr: false });
import { Icons } from './icons';
import type { MockupMask, Point } from '@/types';

import { useQuadInteraction } from '@/hooks/useQuadInteraction';
import { useMaskHistory } from '@/hooks/useMaskHistory';
import { useCanvasDrawing } from '@/hooks/useCanvasDrawing';
import { useMockupBlend } from '@/hooks/useMockupBlend';
import { useMockupGeneration } from '@/hooks/useMockupGeneration';

import TemplatePanel from './mockup/TemplatePanel';
import VariationsPanel from './mockup/VariationsPanel';
import BlendControlsPanel from './mockup/BlendControlsPanel';
import GeneratedMockupsGrid from './mockup/GeneratedMockupsGrid';
import BatchPreviewModal from './mockup/BatchPreviewModal';
import DesignOverlay from './mockup/DesignOverlay';
import MockupAIPanel from './mockup/MockupAIPanel';
import type { DesignOverlayState, GeneratedVariation } from '@/types';

function mid(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function defaultEdgeCurves(quad: Point[]): [Point, Point, Point, Point] {
    const [tl, tr, br, bl] = quad;
    return [mid(tl, tr), mid(tr, br), mid(br, bl), mid(tl, bl)];
}

export default function MockupEditor() {
    const {
        variations, mockupTemplates, sourceDesigns,
        addMockupTemplate, removeMockupTemplate, updateMockupTemplate,
        setVariations, toggleVariationSelection, updateVariation,
        setStep, isCompositing,
    } = useWorkflowStore();
    const addToast = useToastStore((s) => s.addToast);

    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
    const [removeBgVariationId, setRemoveBgVariationId] = useState<string | null>(null);
    const [seoMockupId, setSeoMockupId] = useState<string | null>(null);
    const [canvasDragOver, setCanvasDragOver] = useState(false);

    const activeTemplate = mockupTemplates.find((t) => t.id === activeTemplateId);

    // Blend controls
    const blend = useMockupBlend(activeTemplateId);

    // Generation logic
    const gen = useMockupGeneration();

    // Canvas ref + coord helpers
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const scaleRef = useRef(1);

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

    // Forward-declared refs to break circular deps
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
            fitMode: blend.fitMode,
            blendMode: blend.blendMode,
            opacity: blend.opacity,
            shadow: blend.shadowEnabled ? { blur: blend.shadowBlur, color: 'rgba(0,0,0,0.5)' } : undefined,
            backgroundBlur: blend.bgBlurEnabled ? blend.bgBlur : undefined,
        };
    }, [blend.fitMode, blend.blendMode, blend.opacity, blend.shadowEnabled, blend.shadowBlur, blend.bgBlurEnabled, blend.bgBlur]);

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
        getCoords, canvasRef, scaleRef, activeTemplateId, commitMask, commitMaskDirect,
    });

    cornersRef.current = interaction.corners;
    edgeCPsRef.current = interaction.edgeCPs;

    // History hook
    const history = useMaskHistory({
        activeTemplateId, updateMockupTemplate,
        setCorners: interaction.setCorners,
        setEdgeCPs: interaction.setEdgeCPs,
        setPlacingCorner: interaction.setPlacingCorner,
    });

    pushHistoryRef.current = history.pushHistory;

    // Canvas drawing hook
    const { resetCanvasSize, preloadImages } = useCanvasDrawing({
        canvasRef, scaleRef,
        activeTemplateImageUrl: activeTemplate?.imageUrl,
        corners: interaction.corners,
        edgeCPs: interaction.edgeCPs,
        dragging: interaction.dragging,
        quadDone: interaction.quadDone,
        dragStart: interaction.dragStart,
        dragCurrent: interaction.dragCurrent,
        bgBlurEnabled: blend.bgBlurEnabled,
        bgBlur: blend.bgBlur,
        hideQuad: !!activeTemplate?.designOverlay,
    });

    useEffect(() => {
        preloadImages(mockupTemplates.map(t => t.imageUrl));
    }, [mockupTemplates, preloadImages]);

    // Sync state when switching templates
    useEffect(() => {
        const template = useWorkflowStore.getState().mockupTemplates.find((t) => t.id === activeTemplateId);
        interaction.restoreFromMask(template?.mask ?? null);
        blend.restoreFromMask(template?.mask);
        history.resetHistory(template?.mask ?? null);
        resetCanvasSize();
        if (template?.imageUrl) { const img = new Image(); img.src = template.imageUrl; }
    }, [activeTemplateId, interaction.restoreFromMask, history.resetHistory, resetCanvasSize]);

    // Update mask when blend controls change
    useEffect(() => {
        if (interaction.quadDone && activeTemplate) {
            const mask = buildMaskFromState(interaction.corners, interaction.edgeCPs);
            updateMockupTemplate(activeTemplate.id, { mask });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blend.fitMode, blend.blendMode, blend.opacity, blend.shadowEnabled, blend.shadowBlur, blend.bgBlurEnabled, blend.bgBlur]);

    // Delete key to remove mask
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                if (!activeTemplate || activeTemplate.designOverlay) return;
                if (!activeTemplate.mask) return;
                handleResetMask();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [activeTemplate]);

    const applyMaskToAll = () => {
        if (!activeTemplate?.mask) { addToast('error', 'Template hiện tại chưa có mask'); return; }
        const targets = mockupTemplates.filter(t => t.id !== activeTemplateId);
        if (targets.length === 0) { addToast('error', 'Không có template nào khác'); return; }
        for (const t of targets) updateMockupTemplate(t.id, { mask: { ...activeTemplate.mask } });
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

    // Build mask from overlay position
    const buildMaskFromOverlay = useCallback((ov: DesignOverlayState, existingMask?: MockupMask | null): MockupMask => {
        const cT = (ov.cropTop ?? 0) / 100, cR = (ov.cropRight ?? 0) / 100;
        const cB = (ov.cropBottom ?? 0) / 100, cL = (ov.cropLeft ?? 0) / 100;
        const x = ov.x + ov.width * cL, y = ov.y + ov.height * cT;
        const w = ov.width * (1 - cL - cR), h = ov.height * (1 - cT - cB);
        const cx = ov.x + ov.width / 2, cy = ov.y + ov.height / 2;
        const rad = (ov.rotation * Math.PI) / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const rot = (px: number, py: number): Point => ({
            x: cos * (px - cx) - sin * (py - cy) + cx,
            y: sin * (px - cx) + cos * (py - cy) + cy,
        });
        const quad: [Point, Point, Point, Point] = [rot(x, y), rot(x + w, y), rot(x + w, y + h), rot(x, y + h)];
        return {
            x, y, width: w, height: h, rotation: ov.rotation, mode: 'quad' as const, quad, edgeCurves: undefined,
            fitMode: existingMask?.fitMode ?? 'contain', blendMode: existingMask?.blendMode ?? 'normal',
            opacity: existingMask?.opacity ?? 100, shadow: existingMask?.shadow, backgroundBlur: existingMask?.backgroundBlur,
        };
    }, []);

    const createOverlayFromVariation = useCallback((variationId: string, imageUrl: string) => {
        if (!activeTemplate) return;
        const mask = activeTemplate.mask;
        const img = new Image();
        img.onload = () => {
            const canvas = canvasRef.current;
            const s = scaleRef.current;
            const cw = canvas ? canvas.width / s : 500;
            const ch = canvas ? canvas.height / s : 500;
            const ar = img.naturalWidth / img.naturalHeight;
            let cx: number, cy: number, w: number, h: number;
            if (mask && mask.width > 0 && mask.height > 0) {
                cx = mask.x + mask.width / 2; cy = mask.y + mask.height / 2;
                if (ar > mask.width / mask.height) { w = mask.width; h = w / ar; }
                else { h = mask.height; w = h * ar; }
            } else {
                cx = cw / 2; cy = ch / 2; w = Math.min(img.naturalWidth, cw * 0.5); h = w / ar;
            }
            const overlay: DesignOverlayState = {
                variationId, imageUrl, x: cx - w / 2, y: cy - h / 2, width: w, height: h,
                rotation: 0, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
            };
            const newMask = buildMaskFromOverlay(overlay, activeTemplate.mask);
            updateMockupTemplate(activeTemplate.id, { designOverlay: overlay, mask: newMask });
            interaction.restoreFromMask(newMask);
        };
        img.src = imageUrl;
    }, [activeTemplate, updateMockupTemplate, buildMaskFromOverlay, interaction]);

    // Canvas drop handlers
    const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setCanvasDragOver(true);
    }, []);

    const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const { clientX, clientY } = e;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) setCanvasDragOver(false);
    }, []);

    const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault(); setCanvasDragOver(false);
        if (!activeTemplate) { addToast('error', 'Chọn template trước khi kéo thả'); return; }
        const variationId = e.dataTransfer.getData('application/x-variation-id');
        if (variationId) {
            const variation = variations.find(v => v.id === variationId);
            if (variation) {
                setVariations(variations.map(v => ({ ...v, selected: v.id === variationId })));
                createOverlayFromVariation(variation.id, variation.imageUrl);
                addToast('success', `Đã đặt "${variation.styleName}" lên template`);
            }
            return;
        }
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (!file.type.startsWith('image/')) { addToast('error', 'Chỉ chấp nhận file ảnh'); return; }
            try {
                const formData = new FormData(); formData.append('file', file);
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                const newVariation: GeneratedVariation = {
                    id: crypto.randomUUID(), styleId: 'custom', styleName: file.name.replace(/\.[^.]+$/, ''),
                    imageUrl: data.url, selected: true, loading: false,
                    sourceDesignId: sourceDesigns.length === 1 ? sourceDesigns[0].id : undefined,
                    sourceDesignName: sourceDesigns.length === 1 ? sourceDesigns[0].name : undefined,
                };
                setVariations([...variations, newVariation]);
                createOverlayFromVariation(newVariation.id, data.url);
                addToast('success', `Đã đặt "${newVariation.styleName}" lên template`);
            } catch (err) { addToast('error', err instanceof Error ? err.message : 'Upload thất bại'); }
        }
    }, [activeTemplate, variations, setVariations, addToast, createOverlayFromVariation]);

    const handleOverlayChange = useCallback((update: Partial<DesignOverlayState>) => {
        const currentTemplate = useWorkflowStore.getState().mockupTemplates.find(t => t.id === activeTemplateId);
        if (!currentTemplate?.designOverlay) return;
        const newOverlay = { ...currentTemplate.designOverlay, ...update };
        const newMask = buildMaskFromOverlay(newOverlay, currentTemplate.mask);
        updateMockupTemplate(currentTemplate.id, { designOverlay: newOverlay, mask: newMask });
        interaction.restoreFromMask(newMask);
    }, [activeTemplateId, updateMockupTemplate, buildMaskFromOverlay, interaction]);

    const handleOverlayRemove = useCallback(() => {
        if (!activeTemplate) return;
        updateMockupTemplate(activeTemplate.id, { designOverlay: null });
    }, [activeTemplate, updateMockupTemplate]);

    const getCanvasDisplayScale = useCallback((): number => {
        const canvas = canvasRef.current;
        if (!canvas) return 1;
        const rect = canvas.getBoundingClientRect();
        return rect.width / canvas.width * scaleRef.current;
    }, []);

    const handleEditMockupWrapper = useCallback((mockup: import('@/types').GeneratedMockup) => {
        const templateId = gen.handleEditMockup(mockup);
        if (templateId) setActiveTemplateId(templateId);
    }, [gen.handleEditMockup]);

    const generatedMockups = useWorkflowStore((s) => s.generatedMockups);

    return (
        <div className="mockup-container">
            <div className="mockup-header">
                <div className="mockup-header-actions">
                    <button className="btn-ghost" onClick={() => setStep('variations')}>← Quay lại</button>
                    <span className="badge">{gen.selectedVariations.length} biến thể đã chọn</span>
                </div>
            </div>

            <div className="mockup-layout mockup-layout--3col">
                <div className="mockup-col-left">
                    <TemplatePanel
                        mockupTemplates={mockupTemplates}
                        activeTemplateId={activeTemplateId}
                        addMockupTemplate={addMockupTemplate}
                        removeMockupTemplate={removeMockupTemplate}
                        updateMockupTemplate={updateMockupTemplate}
                        setActiveTemplateId={setActiveTemplateId}
                    />
                </div>

                <div
                    ref={gen.canvasAreaRef}
                    className="mockup-canvas-area"
                    onDragOver={handleCanvasDragOver}
                    onDragLeave={handleCanvasDragLeave}
                    onDrop={handleCanvasDrop}
                    style={canvasDragOver ? { outline: '3px dashed var(--accent, #00e68a)', outlineOffset: -3, background: 'rgba(0,230,138,0.05)' } : undefined}
                >
                    {activeTemplate ? (
                        <>
                            <p className="canvas-instructions">
                                {!interaction.quadDone
                                    ? 'Kéo để vẽ vùng mockup, hoặc click 4 góc (TL → TR → BR → BL)'
                                    : 'Kéo góc xanh để chỉnh. Kéo handle vàng để uốn cong. Kéo bên trong để di chuyển.'}
                            </p>

                            <div className="mockup-canvas-toolbar">
                                <div className="undo-redo-bar">
                                    <button className="btn-icon" title="Hoàn tác (Ctrl+Z)" onClick={history.undo} disabled={history.historyIndex <= 0}>{Icons.undo}</button>
                                    <button className="btn-icon" title="Làm lại (Ctrl+Shift+Z)" onClick={history.redo} disabled={history.historyIndex >= history.maskHistory.length - 1}>{Icons.redo}</button>
                                    {interaction.quadDone && <button className="btn-ghost-sm" onClick={handleResetCurves}>Đặt lại đường cong</button>}
                                    {interaction.quadDone && activeTemplate?.mask && mockupTemplates.length > 1 && (
                                        <button className="btn-ghost-sm" onClick={applyMaskToAll} style={{ color: 'var(--accent, #00e68a)', fontWeight: 600 }}>
                                            Áp dụng mask → {mockupTemplates.length - 1} mẫu khác
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div
                                className="canvas-wrapper"
                                onMouseDown={interaction.handleCanvasMouseDown}
                                onMouseMove={interaction.handleCanvasMouseMove}
                                onMouseUp={interaction.handleCanvasMouseUp}
                                onMouseLeave={interaction.handleCanvasMouseUp}
                                onTouchStart={interaction.handleTouchStart}
                                onTouchMove={interaction.handleTouchMove}
                                onTouchEnd={interaction.handleTouchEnd}
                                style={{ touchAction: 'none' }}
                            >
                                <canvas ref={canvasRef} style={{ cursor: interaction.quadDone ? 'default' : 'crosshair' }} />
                                {interaction.quadDone && interaction.corners.length >= 4 && !activeTemplate?.designOverlay && (() => {
                                    const cs = getCanvasDisplayScale();
                                    const c = interaction.corners;
                                    const topX = (c[0].x + c[1].x) / 2 * cs;
                                    const topY = Math.min(c[0].y, c[1].y) * cs;
                                    const topEdgeCPY = interaction.edgeCPs ? interaction.edgeCPs[0].y * cs : topY;
                                    const toolbarBottom = topY - 44 + 36;
                                    const handleNearToolbar = topEdgeCPY < toolbarBottom && topEdgeCPY > topY - 60;
                                    return (
                                        <div className="overlay-toolbar" style={{ top: topY - 44, left: topX, transform: 'translateX(-50%)', opacity: handleNearToolbar ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                                            <button className="overlay-toolbar-btn" title="Đặt lại đường cong" onClick={handleResetCurves}>⟲</button>
                                            <button className="overlay-toolbar-btn overlay-toolbar-btn--delete" title="Xoá mask (Delete)" onClick={handleResetMask}>✕</button>
                                        </div>
                                    );
                                })()}
                                {activeTemplate?.designOverlay && (
                                    <DesignOverlay
                                        overlay={activeTemplate.designOverlay}
                                        mask={activeTemplate.mask}
                                        canvasScale={getCanvasDisplayScale()}
                                        canvasWidth={canvasRef.current ? canvasRef.current.width / scaleRef.current : 0}
                                        canvasHeight={canvasRef.current ? canvasRef.current.height / scaleRef.current : 0}
                                        onChange={handleOverlayChange}
                                        onRemove={handleOverlayRemove}
                                        disabled={!!interaction.dragging || (!interaction.quadDone && (interaction.corners.length > 0 || !!interaction.dragStart))}
                                        opacity={blend.opacity}
                                        blendMode={blend.blendMode}
                                        shadowEnabled={blend.shadowEnabled}
                                        shadowBlur={blend.shadowBlur}
                                    />
                                )}
                            </div>

                            {(interaction.quadDone || activeTemplate?.designOverlay) && (
                                <BlendControlsPanel
                                    fitMode={blend.fitMode} setFitMode={blend.setFitMode}
                                    blendMode={blend.blendMode} setBlendMode={blend.setBlendMode}
                                    opacity={blend.opacity} setOpacity={blend.setOpacity}
                                    shadowEnabled={blend.shadowEnabled} setShadowEnabled={blend.setShadowEnabled}
                                    shadowBlur={blend.shadowBlur} setShadowBlur={blend.setShadowBlur}
                                    bgBlurEnabled={blend.bgBlurEnabled} setBgBlurEnabled={blend.setBgBlurEnabled}
                                    bgBlur={blend.bgBlur} setBgBlur={blend.setBgBlur}
                                    showFitMode={interaction.quadDone && !activeTemplate?.designOverlay}
                                />
                            )}
                        </>
                    ) : (
                        <div className="canvas-empty">
                            <h3>Chọn hoặc thêm mockup template</h3>
                            <p>Upload ảnh mockup rồi click 4 góc để đặt vùng thiết kế. Kéo handle vàng để uốn cong.</p>
                            <p style={{ marginTop: 8, fontSize: '0.8rem' }}>Hoặc kéo thả ảnh thiết kế từ sidebar vào đây</p>
                        </div>
                    )}
                </div>

                <div className="mockup-col-right">
                    <VariationsPanel
                        variations={variations}
                        setVariations={setVariations}
                        toggleVariationSelection={toggleVariationSelection}
                        setRemoveBgVariationId={setRemoveBgVariationId}
                    />
                </div>
            </div>

            <div className="mockup-generate-bar">
                {gen.editingMockupId ? (
                    <div className="regenerate-single-bar">
                        <button className="btn-primary btn-lg btn-regenerate-single" disabled={gen.isRegeneratingSingle} onClick={gen.handleRegenerateSingle}>
                            {gen.isRegeneratingSingle ? <><span className="spinner-sm" /> Đang tạo lại...</> : 'Tạo lại mockup này'}
                        </button>
                        <button className="btn-ghost" onClick={() => gen.setEditingMockupId(null)}>Hủy chỉnh sửa</button>
                    </div>
                ) : (
                    <button className="btn-primary btn-lg" disabled={gen.totalMockupCount === 0 || isCompositing} onClick={() => gen.setShowBatchPreview(true)}>
                        {isCompositing ? <><span className="spinner-sm" /> Đang tạo mockup...</> : `Tạo ${gen.totalMockupCount} mockup`}
                    </button>
                )}
                <button
                    className="btn-primary btn-lg"
                    disabled={gen.totalMockupCount === 0 || gen.isAIGenerating || isCompositing}
                    onClick={() => gen.setShowAIOptions(!gen.showAIOptions)}
                    style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                >
                    {gen.isAIGenerating ? <><span className="spinner-sm" /> AI đang tạo...</> : `Tạo AI ${gen.totalMockupCount} mockup`}
                </button>
            </div>

            {gen.showAIOptions && (
                <MockupAIPanel
                    selectedVariations={gen.selectedVariations}
                    totalMockupCount={gen.totalMockupCount}
                    isTemplateReady={gen.isTemplateReady}
                    onClose={() => gen.setShowAIOptions(false)}
                    onGeneratingChange={gen.setIsAIGenerating}
                />
            )}

            {generatedMockups.length > 0 && (
                <GeneratedMockupsGrid
                    generatedMockups={generatedMockups}
                    setLightboxImage={setLightboxImage}
                    setSeoMockupId={setSeoMockupId}
                    onRetry={() => gen.handleGenerateMockups()}
                    onEditMockup={handleEditMockupWrapper}
                    editingMockupId={gen.editingMockupId}
                />
            )}

            {lightboxImage && <Lightbox imageUrl={lightboxImage.url} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />}

            {gen.showBatchPreview && (
                <BatchPreviewModal
                    mockupTemplates={mockupTemplates}
                    selectedVariations={gen.selectedVariations}
                    sourceDesigns={sourceDesigns}
                    onClose={() => gen.setShowBatchPreview(false)}
                    onGenerate={(excluded) => gen.handleGenerateMockups(excluded)}
                />
            )}

            {removeBgVariationId && (() => {
                const v = variations.find(x => x.id === removeBgVariationId);
                if (!v) return null;
                return (
                    <RemoveBgPanel
                        imageUrl={v.imageUrl}
                        onResult={(newUrl) => { updateVariation(v.id, { imageUrl: newUrl }); addToast('success', `Đã tách nền: ${v.styleName}`); }}
                        onClose={() => setRemoveBgVariationId(null)}
                    />
                );
            })()}

            {seoMockupId && (() => {
                const m = generatedMockups.find(x => x.id === seoMockupId);
                if (!m) return null;
                return <SEOPanel mockup={m} onClose={() => setSeoMockupId(null)} />;
            })()}
        </div>
    );
}
