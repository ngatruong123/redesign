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
import DesignOverlay from './mockup/DesignOverlay';
import type { DesignOverlayState } from '@/types';

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
    const [canvasDragOver, setCanvasDragOver] = useState(false);
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [showAIOptions, setShowAIOptions] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiPlacement, setAiPlacement] = useState<'auto' | 'center' | 'full' | 'wrap'>('auto');
    const [aiStyle, setAiStyle] = useState<'photorealistic' | 'studio' | 'flat-lay' | 'lifestyle' | 'artistic'>('photorealistic');
    const [aiImageSize, setAiImageSize] = useState<'1K' | '2K' | '4K'>('2K');
    const [aiAspectRatio, setAiAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');

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
    }, [activeTemplateId, interaction.restoreFromMask, history.resetHistory, setFitMode, setBlendMode, setOpacity, setShadowEnabled, setShadowBlur]);

    // Update mask when blend/opacity/shadow change
    useEffect(() => {
        if (interaction.quadDone && activeTemplate) {
            const mask = buildMaskFromState(interaction.corners, interaction.edgeCPs);
            updateMockupTemplate(activeTemplate.id, { mask });
        }
    }, [fitMode, blendMode, opacity, shadowEnabled, shadowBlur, interaction.quadDone, activeTemplate, buildMaskFromState, interaction.corners, interaction.edgeCPs, updateMockupTemplate]);

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

    // --- Design Overlay ---
    const createOverlayFromVariation = useCallback((variationId: string, imageUrl: string) => {
        if (!activeTemplate) return;
        const mask = activeTemplate.mask;
        // Load image to get natural dimensions
        const img = new Image();
        img.onload = () => {
            let cx: number, cy: number, w: number, h: number;
            if (mask) {
                // Center on mask bounding box
                cx = mask.x + mask.width / 2;
                cy = mask.y + mask.height / 2;
                // Fit within mask bounds
                const ar = img.naturalWidth / img.naturalHeight;
                if (ar > mask.width / mask.height) {
                    w = mask.width;
                    h = w / ar;
                } else {
                    h = mask.height;
                    w = h * ar;
                }
            } else {
                // Center on canvas
                const canvas = canvasRef.current;
                const s = scaleRef.current;
                const cw = canvas ? canvas.width / s : 500;
                const ch = canvas ? canvas.height / s : 500;
                cx = cw / 2;
                cy = ch / 2;
                w = Math.min(img.naturalWidth, cw * 0.5);
                h = w / (img.naturalWidth / img.naturalHeight);
            }
            const overlay: DesignOverlayState = {
                variationId,
                imageUrl,
                x: cx - w / 2,
                y: cy - h / 2,
                width: w,
                height: h,
                rotation: 0,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
            };
            updateMockupTemplate(activeTemplate.id, { designOverlay: overlay });
        };
        img.src = imageUrl;
    }, [activeTemplate, updateMockupTemplate]);

    // --- Canvas Drop ---
    const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setCanvasDragOver(true);
    }, []);

    const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
        // Only set false when leaving the container itself, not child elements
        const rect = e.currentTarget.getBoundingClientRect();
        const { clientX, clientY } = e;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
            setCanvasDragOver(false);
        }
    }, []);

    const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setCanvasDragOver(false);

        if (!activeTemplate) {
            addToast('error', 'Chọn template trước khi kéo thả');
            return;
        }

        // Case 1: Drop from VariationsPanel (has variation ID)
        const variationId = e.dataTransfer.getData('application/x-variation-id');
        if (variationId) {
            const variation = variations.find(v => v.id === variationId);
            if (variation) {
                // Select variation
                const updated = variations.map(v => ({ ...v, selected: v.id === variationId }));
                setVariations(updated);
                // Create design overlay centered on mask
                createOverlayFromVariation(variation.id, variation.imageUrl);
                addToast('success', `Đã đặt "${variation.styleName}" lên template`);
            }
            return;
        }

        // Case 2: Drop from file explorer
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (!file.type.startsWith('image/')) {
                addToast('error', 'Chỉ chấp nhận file ảnh');
                return;
            }
            try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                const newVariation = {
                    id: crypto.randomUUID(),
                    styleId: 'custom',
                    styleName: file.name.replace(/\.[^.]+$/, ''),
                    imageUrl: data.url,
                    selected: true,
                    loading: false,
                };
                setVariations([...variations, newVariation]);
                createOverlayFromVariation(newVariation.id, data.url);
                addToast('success', `Đã đặt "${newVariation.styleName}" lên template`);
            } catch (err) {
                addToast('error', err instanceof Error ? err.message : 'Upload thất bại');
            }
        }
    }, [activeTemplate, variations, setVariations, addToast, createOverlayFromVariation]);

    // --- AI Generate Mockups ---
    const handleAIGenerateMockups = async () => {
        const templatesWithMask = mockupTemplates.filter(isTemplateReady);
        if (templatesWithMask.length === 0 || selectedVariations.length === 0) return;

        setIsAIGenerating(true);
        setError(null);

        try {
            // Build combined prompt from options
            const promptParts: string[] = [];
            if (aiPlacement !== 'auto') {
                const placementMap = {
                    center: 'Center the design on the product',
                    full: 'Make the design cover the entire product surface',
                    wrap: 'Wrap the design around the product naturally following its 3D shape',
                };
                promptParts.push(placementMap[aiPlacement]);
            }
            if (aiStyle !== 'photorealistic') {
                const styleMap = {
                    studio: 'Professional studio photography with clean background, perfect lighting',
                    'flat-lay': 'Flat-lay top-down product photography style on a clean surface',
                    lifestyle: 'Lifestyle scene with the product in a natural, real-world environment',
                    artistic: 'Creative artistic composition with dramatic lighting and mood',
                };
                promptParts.push(styleMap[aiStyle]);
            }
            if (aiPrompt.trim()) promptParts.push(aiPrompt.trim());
            const combinedPrompt = promptParts.length > 0 ? promptParts.join('. ') + '.' : undefined;

            const res = await fetch('/api/mockup/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateIds: templatesWithMask.map(t => t.id),
                    variationIds: selectedVariations.map(v => v.id),
                    templates: templatesWithMask.map(t => ({ id: t.id, name: t.name, imageUrl: t.imageUrl })),
                    variations: selectedVariations.map(v => ({ id: v.id, name: v.styleName, imageUrl: v.imageUrl })),
                    prompt: combinedPrompt,
                    imageSize: aiImageSize,
                    aspectRatio: aiAspectRatio,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setGeneratedMockups(data.results);
            addToast('success', `AI đã tạo ${data.results.length} mockup!`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Tạo AI mockup thất bại';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsAIGenerating(false);
        }
    };

    // --- Generate ---
    const handleGenerateMockups = async (excludedKeys?: Set<string>) => {
        const readyTemplates = mockupTemplates.filter(isTemplateReady);
        if (readyTemplates.length === 0 || selectedVariations.length === 0) return;

        setShowBatchPreview(false);
        setIsCompositing(true);
        setError(null);

        const items = readyTemplates.flatMap((t) => {
            // If template has designOverlay, use the overlay's image and position
            if (t.designOverlay) {
                const ov = t.designOverlay;
                const overlayVariation = variations.find(v => v.id === ov.variationId);
                if (!overlayVariation) return [];

                if (t.mask) {
                    // Has both mask (quad) and overlay — send overlay info for cropping
                    return [{
                        mockupImagePath: t.imageUrl,
                        designImagePath: ov.imageUrl,
                        mask: t.mask,
                        overlay: { x: ov.x, y: ov.y, width: ov.width, height: ov.height, rotation: ov.rotation },
                        templateName: t.name,
                        variationName: overlayVariation.styleName,
                    }];
                } else {
                    // Overlay only — use overlay rect as mask
                    const rectMask = {
                        x: ov.x, y: ov.y, width: ov.width, height: ov.height,
                        rotation: ov.rotation,
                        mode: 'rect' as const,
                        fitMode: 'fill' as const,
                        blendMode: 'normal' as const,
                        opacity: 100,
                    };
                    return [{
                        mockupImagePath: t.imageUrl,
                        designImagePath: ov.imageUrl,
                        mask: rectMask,
                        templateName: t.name,
                        variationName: overlayVariation.styleName,
                    }];
                }
            }
            // Normal mask-based generation with selected variations
            return selectedVariations
                .filter((v) => !excludedKeys || !excludedKeys.has(`${t.id}__${v.id}`))
                .map((v) => ({
                    mockupImagePath: t.imageUrl,
                    designImagePath: v.imageUrl,
                    mask: t.mask,
                    templateName: t.name,
                    variationName: v.styleName,
                }));
        });

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
            const msg = err instanceof Error ? err.message : 'Tạo mockup thất bại';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsCompositing(false);
        }
    };

    const handleOverlayChange = useCallback((update: Partial<DesignOverlayState>) => {
        if (!activeTemplate?.designOverlay) return;
        const newOverlay = { ...activeTemplate.designOverlay, ...update };
        updateMockupTemplate(activeTemplate.id, { designOverlay: newOverlay });
    }, [activeTemplate, updateMockupTemplate]);

    const handleOverlayRemove = useCallback(() => {
        if (!activeTemplate) return;
        updateMockupTemplate(activeTemplate.id, { designOverlay: null });
    }, [activeTemplate, updateMockupTemplate]);

    // Compute canvas display scale for overlay positioning
    const getCanvasDisplayScale = useCallback((): number => {
        const canvas = canvasRef.current;
        if (!canvas) return 1;
        const rect = canvas.getBoundingClientRect();
        return rect.width / canvas.width * scaleRef.current;
    }, []);

    const isTemplateReady = (t: typeof mockupTemplates[0]) => !!(t.mask || t.designOverlay);
    const readyTemplateCount = mockupTemplates.filter(isTemplateReady).length;

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

                <div
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

                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div className="undo-redo-bar">
                                    <button className="btn-icon" title="Hoàn tác (Ctrl+Z)" onClick={history.undo} disabled={history.historyIndex <= 0}>{Icons.undo}</button>
                                    <button className="btn-icon" title="Làm lại (Ctrl+Shift+Z)" onClick={history.redo} disabled={history.historyIndex >= history.maskHistory.length - 1}>{Icons.redo}</button>
                                    <button className="btn-ghost-sm" onClick={handleResetMask}>Đặt lại</button>
                                    {interaction.quadDone && <button className="btn-ghost-sm" onClick={handleResetCurves}>Đặt lại đường cong</button>}
                                    {interaction.quadDone && selectedTemplateIds.size > 0 && (
                                        <button
                                            className="btn-ghost-sm"
                                            onClick={applyMaskToSelected}
                                            style={{ color: 'var(--accent, #00e68a)', fontWeight: 600 }}
                                        >
                                            Áp dụng mask → {selectedTemplateIds.size} mẫu
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
                                {activeTemplate?.designOverlay && (
                                    <DesignOverlay
                                        overlay={activeTemplate.designOverlay}
                                        mask={activeTemplate.mask}
                                        canvasScale={getCanvasDisplayScale()}
                                        onChange={handleOverlayChange}
                                        onRemove={handleOverlayRemove}
                                        disabled={!!interaction.dragging || (!interaction.quadDone && (interaction.corners.length > 0 || !!interaction.dragStart))}
                                    />
                                )}
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
                            <p style={{ marginTop: 8, fontSize: '0.8rem' }}>Hoặc kéo thả ảnh thiết kế từ sidebar vào đây</p>
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
                <button
                    className="btn-primary btn-lg"
                    disabled={readyTemplateCount === 0 || selectedVariations.length === 0 || isAIGenerating || isCompositing}
                    onClick={() => setShowAIOptions(!showAIOptions)}
                    style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                >
                    {isAIGenerating ? <><span className="spinner-sm" /> AI đang tạo...</>
                        : `Tạo AI ${readyTemplateCount * selectedVariations.length} mockup`}
                </button>
            </div>

            {showAIOptions && (
                <div className="ai-options-panel">
                    <div className="ai-options-header">
                        <h4>Tuỳ chỉnh AI Mockup</h4>
                        <button className="btn-icon-sm" onClick={() => setShowAIOptions(false)}>✕</button>
                    </div>

                    <div className="ai-options-grid">
                        <div className="ai-option-group">
                            <label>Vị trí đặt design</label>
                            <div className="ai-option-chips">
                                {([['auto', 'Tự động'], ['center', 'Chính giữa'], ['full', 'Phủ toàn bộ'], ['wrap', 'Bọc quanh']] as const).map(([val, label]) => (
                                    <button key={val} className={`ai-chip ${aiPlacement === val ? 'active' : ''}`} onClick={() => setAiPlacement(val)}>{label}</button>
                                ))}
                            </div>
                        </div>

                        <div className="ai-option-group">
                            <label>Phong cách chụp</label>
                            <div className="ai-option-chips">
                                {([['photorealistic', 'Chân thực'], ['studio', 'Studio'], ['flat-lay', 'Flat Lay'], ['lifestyle', 'Đời thường'], ['artistic', 'Nghệ thuật']] as const).map(([val, label]) => (
                                    <button key={val} className={`ai-chip ${aiStyle === val ? 'active' : ''}`} onClick={() => setAiStyle(val)}>{label}</button>
                                ))}
                            </div>
                        </div>

                        <div className="ai-option-group">
                            <label>Độ phân giải</label>
                            <div className="ai-option-chips">
                                {([['1K', '1K'], ['2K', '2K'], ['4K', '4K']] as const).map(([val, label]) => (
                                    <button key={val} className={`ai-chip ${aiImageSize === val ? 'active' : ''}`} onClick={() => setAiImageSize(val)}>{label}</button>
                                ))}
                            </div>
                        </div>

                        <div className="ai-option-group">
                            <label>Tỷ lệ khung hình</label>
                            <div className="ai-option-chips">
                                {([['1:1', '1:1'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9']] as const).map(([val, label]) => (
                                    <button key={val} className={`ai-chip ${aiAspectRatio === val ? 'active' : ''}`} onClick={() => setAiAspectRatio(val)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="ai-option-group" style={{ marginTop: 8 }}>
                        <label>Prompt tuỳ chỉnh (không bắt buộc)</label>
                        <textarea
                            className="ai-prompt-input"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="VD: Đặt design ở mặt trước áo, thêm bóng đổ nhẹ, ánh sáng studio ấm, nền trắng..."
                            rows={3}
                        />
                    </div>

                    <button
                        className="btn-primary btn-lg"
                        disabled={readyTemplateCount === 0 || selectedVariations.length === 0 || isAIGenerating}
                        onClick={handleAIGenerateMockups}
                        style={{ marginTop: 8, width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                    >
                        {isAIGenerating ? <><span className="spinner-sm" /> AI đang tạo...</>
                            : `Tạo ${readyTemplateCount * selectedVariations.length} AI Mockup`}
                    </button>
                </div>
            )}

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
