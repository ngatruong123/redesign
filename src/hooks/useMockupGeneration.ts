'use client';

import { useState, useCallback, useRef } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import type { MockupTemplate, GeneratedVariation, GeneratedMockup, DesignOverlayState } from '@/types';

function isTemplateReady(t: MockupTemplate): boolean {
    return !!(t.mask || t.designOverlay);
}

export function useMockupGeneration() {
    const {
        variations, mockupTemplates, generatedMockups,
        setGeneratedMockups, isCompositing, setIsCompositing, setError,
    } = useWorkflowStore();

    const addToast = useToastStore((s) => s.addToast);

    const [editingMockupId, setEditingMockupId] = useState<string | null>(null);
    const [isRegeneratingSingle, setIsRegeneratingSingle] = useState(false);
    const [showBatchPreview, setShowBatchPreview] = useState(false);
    const [showAIOptions, setShowAIOptions] = useState(false);
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const canvasAreaRef = useRef<HTMLDivElement>(null);

    const selectedVariations = variations.filter((v) => v.selected && v.imageUrl);

    const readyTemplateCount = mockupTemplates.filter(isTemplateReady).length;

    const totalMockupCount = mockupTemplates.filter(isTemplateReady).reduce((count, t) => {
        let n = 0;
        if (t.designOverlay) {
            const hasOverlayVar = selectedVariations.some(v => v.id === t.designOverlay!.variationId);
            if (hasOverlayVar) n += 1;
        }
        if (t.mask) {
            // Don't double-count: skip the overlay variation since it's already counted above
            n += selectedVariations.filter(v => !(t.designOverlay && v.id === t.designOverlay.variationId)).length;
        }
        return count + n;
    }, 0);

    const handleGenerateMockups = async (excludedKeys?: Set<string>) => {
        const readyTemplates = mockupTemplates.filter(isTemplateReady);
        const hasOverlay = readyTemplates.some(t => t.designOverlay);
        if (readyTemplates.length === 0 || (selectedVariations.length === 0 && !hasOverlay)) return;

        setShowBatchPreview(false);
        setIsCompositing(true);
        setError(null);
        setGeneratedMockups([]);

        const getSourceDesign = (v: GeneratedVariation) => {
            const designs = useWorkflowStore.getState().sourceDesigns;
            // Try direct field on variation
            if (v.sourceDesignId) {
                const sd = designs.find(d => d.id === v.sourceDesignId);
                if (sd) return { sourceDesignId: sd.id, sourceDesignName: sd.name };
                // sourceDesigns may be lost — use the ID directly
                return { sourceDesignId: v.sourceDesignId, sourceDesignName: v.sourceDesignId.slice(0, 8) };
            }
            // Fallback: variation ID = "{designId}_{styleId}" — extract prefix
            const underscoreIdx = v.id.lastIndexOf('_');
            if (underscoreIdx > 0) {
                const designIdCandidate = v.id.slice(0, underscoreIdx);
                const sd = designs.find(d => d.id === designIdCandidate);
                return { sourceDesignId: designIdCandidate, sourceDesignName: sd?.name || designIdCandidate.slice(0, 8) };
            }
            // Last resort: single design
            if (designs.length === 1) {
                return { sourceDesignId: designs[0].id, sourceDesignName: designs[0].name };
            }
            return { sourceDesignId: undefined, sourceDesignName: undefined };
        };

        const items = readyTemplates.flatMap((t) => {
            const result: Array<Record<string, unknown>> = [];

            if (t.designOverlay) {
                const ov = t.designOverlay;
                const overlayVariation = variations.find(v => v.id === ov.variationId);
                const overlayKey = `${t.id}__overlay__${ov.variationId}`;
                if (overlayVariation && !(excludedKeys && excludedKeys.has(overlayKey))) {
                    const overlayData = {
                        x: ov.x, y: ov.y, width: ov.width, height: ov.height, rotation: ov.rotation,
                        cropTop: ov.cropTop, cropRight: ov.cropRight, cropBottom: ov.cropBottom, cropLeft: ov.cropLeft,
                    };
                    const srcInfo = getSourceDesign(overlayVariation);
                    if (t.mask) {
                        result.push({
                            mockupImagePath: t.imageUrl,
                            designImagePath: ov.imageUrl,
                            mask: t.mask,
                            overlay: overlayData,
                            templateId: t.id,
                            variationId: ov.variationId,
                            templateName: t.name,
                            variationName: overlayVariation.styleName,
                            ...srcInfo,
                        });
                    } else {
                        const cT = (ov.cropTop ?? 0) / 100;
                        const cR = (ov.cropRight ?? 0) / 100;
                        const cB = (ov.cropBottom ?? 0) / 100;
                        const cL = (ov.cropLeft ?? 0) / 100;
                        const rectMask = {
                            x: ov.x + ov.width * cL,
                            y: ov.y + ov.height * cT,
                            width: ov.width * (1 - cL - cR),
                            height: ov.height * (1 - cT - cB),
                            rotation: ov.rotation,
                            mode: 'rect' as const,
                            fitMode: 'fill' as const,
                            blendMode: 'normal' as const,
                            opacity: 100,
                        };
                        result.push({
                            mockupImagePath: t.imageUrl,
                            designImagePath: ov.imageUrl,
                            mask: rectMask,
                            overlay: overlayData,
                            templateId: t.id,
                            variationId: ov.variationId,
                            templateName: t.name,
                            variationName: overlayVariation.styleName,
                            ...srcInfo,
                        });
                    }
                }
            }

            if (t.mask) {
                const maskVariations = selectedVariations
                    .filter((v) => {
                        if (t.designOverlay && v.id === t.designOverlay.variationId) return false;
                        if (excludedKeys && excludedKeys.has(`${t.id}__mask__${v.id}`)) return false;
                        return true;
                    });
                for (const v of maskVariations) {
                    const srcInfo = getSourceDesign(v);
                    result.push({
                        mockupImagePath: t.imageUrl,
                        designImagePath: v.imageUrl,
                        mask: t.mask,
                        templateId: t.id,
                        variationId: v.id,
                        templateName: t.name,
                        variationName: v.styleName,
                        ...srcInfo,
                    });
                }
            }

            return result;
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
            // Enrich results with sourceDesign info from the items we sent
            const itemsByKey = new Map(items.map(it => [`${it.templateId}__${it.variationId}`, it]));
            const enriched = data.results.map((r: GeneratedMockup) => {
                if (r.sourceDesignId) return r;
                const key = `${r.templateId}__${r.variationId}`;
                const item = itemsByKey.get(key);
                return item ? { ...r, sourceDesignId: item.sourceDesignId, sourceDesignName: item.sourceDesignName } : r;
            });
            setGeneratedMockups(enriched);
            addToast('success', `Đã tạo ${data.results.length} mockup!`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Tạo mockup thất bại';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsCompositing(false);
        }
    };

    const handleEditMockup = useCallback((mockup: GeneratedMockup) => {
        if (!mockup.templateId) return;
        const template = mockupTemplates.find(t => t.id === mockup.templateId);
        if (!template) {
            addToast('error', 'Không tìm thấy template');
            return;
        }
        setEditingMockupId(mockup.id);
        setTimeout(() => {
            canvasAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        addToast('info', `Đang chỉnh sửa mockup: ${mockup.templateName} · ${mockup.variationName}`);
        return template.id; // caller can use this to set activeTemplateId
    }, [mockupTemplates, addToast]);

    const handleRegenerateSingle = async () => {
        if (!editingMockupId) return;
        const mockup = generatedMockups.find(m => m.id === editingMockupId);
        if (!mockup?.templateId) return;

        const template = mockupTemplates.find(t => t.id === mockup.templateId);
        if (!template) return;

        const variation = variations.find(v => v.id === mockup.variationId);
        if (!variation) return;

        setIsRegeneratingSingle(true);

        const item: Record<string, unknown> = {
            mockupImagePath: template.imageUrl,
            designImagePath: variation.imageUrl,
            templateId: template.id,
            variationId: variation.id,
            templateName: template.name,
            variationName: variation.styleName,
        };

        if (template.designOverlay && template.designOverlay.variationId === variation.id) {
            const ov = template.designOverlay;
            item.overlay = {
                x: ov.x, y: ov.y, width: ov.width, height: ov.height, rotation: ov.rotation,
                cropTop: ov.cropTop, cropRight: ov.cropRight, cropBottom: ov.cropBottom, cropLeft: ov.cropLeft,
            };
            item.mask = template.mask || {
                x: ov.x, y: ov.y, width: ov.width, height: ov.height,
                rotation: ov.rotation, mode: 'rect', fitMode: 'fill', blendMode: 'normal', opacity: 100,
            };
        } else if (template.mask) {
            item.mask = template.mask;
        } else {
            addToast('error', 'Template chưa có mask');
            setIsRegeneratingSingle(false);
            return;
        }

        try {
            const res = await fetch('/api/mockup/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: [item] }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const newMockup = data.results[0];
            if (newMockup) {
                const currentMockups = useWorkflowStore.getState().generatedMockups;
                const updated = currentMockups.map(m =>
                    m.id === editingMockupId ? { ...newMockup, id: editingMockupId } : m
                );
                setGeneratedMockups(updated);
                addToast('success', 'Đã tạo lại mockup!');
            }
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Tạo lại mockup thất bại');
        } finally {
            setIsRegeneratingSingle(false);
            setEditingMockupId(null);
        }
    };

    return {
        selectedVariations,
        readyTemplateCount,
        totalMockupCount,
        isTemplateReady,
        // Generation
        handleGenerateMockups,
        handleRegenerateSingle,
        handleEditMockup,
        // State
        editingMockupId,
        setEditingMockupId,
        isRegeneratingSingle,
        showBatchPreview,
        setShowBatchPreview,
        showAIOptions,
        setShowAIOptions,
        isAIGenerating,
        setIsAIGenerating,
        canvasAreaRef,
    };
}
