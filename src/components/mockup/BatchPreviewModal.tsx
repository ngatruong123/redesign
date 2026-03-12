'use client';

import { useState, useMemo } from 'react';
import BatchPreviewCanvas from '../BatchPreviewCanvas';
import type { MockupTemplate, GeneratedVariation, MockupMask, DesignFile } from '@/types';

interface BatchPreviewModalProps {
    mockupTemplates: MockupTemplate[];
    selectedVariations: GeneratedVariation[];
    sourceDesigns: DesignFile[];
    onClose: () => void;
    onGenerate: (excludedKeys: Set<string>) => void;
}

export default function BatchPreviewModal({
    mockupTemplates,
    selectedVariations,
    sourceDesigns,
    onClose,
    onGenerate,
}: BatchPreviewModalProps) {
    const [batchExcluded, setBatchExcluded] = useState<Set<string>>(new Set());
    const [enlargedKey, setEnlargedKey] = useState<string | null>(null);

    type Combo = { key: string; template: MockupTemplate; variation: GeneratedVariation; overlayMask: MockupMask | undefined; overlay?: { x: number; y: number; width: number; height: number; rotation: number; cropTop?: number; cropRight?: number; cropBottom?: number; cropLeft?: number } };

    const combos = mockupTemplates
        .filter((t) => t.mask || t.designOverlay)
        .flatMap((t): Combo[] => {
            const result: Combo[] = [];

            // 1. Overlay design — render at user-positioned location
            if (t.designOverlay) {
                const ov = t.designOverlay;
                const v = selectedVariations.find(sv => sv.id === ov.variationId);
                if (v) {
                    const overlayData = { x: ov.x, y: ov.y, width: ov.width, height: ov.height, rotation: ov.rotation, cropTop: ov.cropTop, cropRight: ov.cropRight, cropBottom: ov.cropBottom, cropLeft: ov.cropLeft };
                    if (t.mask) {
                        result.push({
                            key: `${t.id}__overlay__${v.id}`,
                            template: t,
                            variation: v,
                            overlayMask: undefined,
                            overlay: overlayData,
                        });
                    } else {
                        result.push({
                            key: `${t.id}__overlay__${v.id}`,
                            template: t,
                            variation: v,
                            overlayMask: {
                                x: ov.x, y: ov.y, width: ov.width, height: ov.height,
                                rotation: ov.rotation, mode: 'rect' as const,
                                fitMode: 'fill' as const, blendMode: 'normal' as const,
                                opacity: 100,
                            } as MockupMask,
                            overlay: overlayData,
                        });
                    }
                }
            }

            // 2. Mask-based — selected variations via perspective warp (skip overlay design)
            if (t.mask) {
                for (const v of selectedVariations) {
                    if (t.designOverlay && v.id === t.designOverlay.variationId) continue;
                    result.push({
                        key: `${t.id}__mask__${v.id}`,
                        template: t,
                        variation: v,
                        overlayMask: undefined,
                    });
                }
            }

            return result;
        });

    // Resolve design ID from variation
    // Build design-group inference map from variations
    const designGroupMap = useMemo(() => {
        const map = new Map<string, { groupId: string; groupName: string }>();
        const byStyle = new Map<string, GeneratedVariation[]>();
        for (const v of selectedVariations) {
            if (!byStyle.has(v.styleId)) byStyle.set(v.styleId, []);
            byStyle.get(v.styleId)!.push(v);
        }
        for (const [, group] of byStyle) {
            for (let i = 0; i < group.length; i++) {
                const v = group[i];
                if (!map.has(v.id)) {
                    map.set(v.id, {
                        groupId: v.sourceDesignId || `design-group-${i}`,
                        groupName: v.sourceDesignName || `Design ${i + 1}`,
                    });
                }
            }
        }
        return map;
    }, [selectedVariations]);

    const resolveDesignIdFromVariation = (v: GeneratedVariation) => {
        if (v.sourceDesignId) return v.sourceDesignId;
        const idx = v.id.lastIndexOf('_');
        if (idx > 0) return v.id.slice(0, idx);
        const inferred = designGroupMap.get(v.id);
        if (inferred) return inferred.groupId;
        if (v.sourceDesignName) return `name:${v.sourceDesignName}`;
        if (sourceDesigns.length === 1) return sourceDesigns[0].id;
        return '__unknown__';
    };

    // Group combos by source design
    const comboGroups = useMemo(() => {
        const map = new Map<string, { design: DesignFile | undefined; displayName: string; combos: Combo[] }>();
        for (const combo of combos) {
            const designId = resolveDesignIdFromVariation(combo.variation);
            if (!map.has(designId)) {
                const design = sourceDesigns.find(d => d.id === designId);
                const inferred = designGroupMap.get(combo.variation.id);
                map.set(designId, {
                    design,
                    displayName: design?.name || inferred?.groupName || combo.variation.sourceDesignName || designId.slice(0, 8),
                    combos: [],
                });
            }
            map.get(designId)!.combos.push(combo);
        }
        const result = Array.from(map.values());
        console.log('[BatchPreview] comboGroups:', result.length, 'keys:', Array.from(map.keys()),
            'sourceDesigns:', sourceDesigns.map(d => ({ id: d.id, name: d.name })),
            'variations srcIds:', selectedVariations.map(v => ({ id: v.id?.slice(0,12), srcId: v.sourceDesignId, srcName: v.sourceDesignName })));
        return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combos, sourceDesigns, designGroupMap]);

    const isMultiDesign = comboGroups.length > 1;

    const activeCount = combos.filter(c => !batchExcluded.has(c.key)).length;

    const toggleBatchItem = (key: string) => {
        setBatchExcluded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleGroup = (groupCombos: Combo[]) => {
        setBatchExcluded(prev => {
            const next = new Set(prev);
            const allExcluded = groupCombos.every(c => next.has(c.key));
            if (allExcluded) {
                groupCombos.forEach(c => next.delete(c.key));
            } else {
                groupCombos.forEach(c => next.add(c.key));
            }
            return next;
        });
    };

    const enlargedCombo = enlargedKey ? combos.find(c => c.key === enlargedKey) : null;

    const renderComboItem = ({ key, template, variation, overlayMask, overlay }: Combo) => {
        const isChecked = !batchExcluded.has(key);
        return (
            <div
                key={key}
                className={`batch-preview-item ${isChecked ? 'checked' : ''}`}
                onClick={() => toggleBatchItem(key)}
                onContextMenu={(e) => { e.preventDefault(); setEnlargedKey(key); }}
                onDoubleClick={(e) => { e.stopPropagation(); setEnlargedKey(key); }}
            >
                {isChecked && <div className="batch-preview-check">✓</div>}
                <div style={{ position: 'relative' }}>
                    <BatchPreviewCanvas
                        templateImageUrl={template.imageUrl}
                        designImageUrl={overlay ? (template.designOverlay?.imageUrl ?? variation.imageUrl) : overlayMask ? (template.designOverlay?.imageUrl ?? variation.imageUrl) : variation.imageUrl}
                        mask={overlayMask ?? template.mask!}
                        overlay={overlay}
                    />
                    <button
                        className="batch-preview-enlarge-btn"
                        onClick={(e) => { e.stopPropagation(); setEnlargedKey(key); }}
                        title="Xem to"
                    >
                        ⤢
                    </button>
                </div>
                <div className="batch-preview-item-label">
                    {template.name} × {variation.styleName}
                </div>
            </div>
        );
    };

    return (
        <div className="batch-preview-overlay" onClick={onClose}>
            <div className="batch-preview-modal" onClick={(e) => e.stopPropagation()}>
                <div className="batch-modal-header">
                    <h3 className="batch-modal-title">Preview mockup combinations</h3>
                    <button className="btn-icon-sm" onClick={onClose}>✕</button>
                </div>
                <p className="batch-modal-subtitle">
                    Click phải / giữ để xem to. Click trái để chọn/bỏ chọn.
                </p>
                <p style={{ fontSize: 11, color: '#f88', padding: '0 16px' }}>
                    DEBUG: groups={comboGroups.length} designs={sourceDesigns.length} vars={selectedVariations.length} srcIds=[{selectedVariations.map(v => v.sourceDesignId || 'null').join(', ')}]
                </p>
                {isMultiDesign ? (
                    comboGroups.map(({ design, displayName, combos: groupCombos }, gi) => {
                        const groupActiveCount = groupCombos.filter(c => !batchExcluded.has(c.key)).length;
                        return (
                            <div key={design?.id || `group-${gi}`} className="variation-group">
                                <div className="variation-group-header">
                                    {design?.url && (
                                        <img src={design.url} alt={displayName} className="variation-group-thumb" />
                                    )}
                                    <span>{displayName} ({groupActiveCount}/{groupCombos.length})</span>
                                    <button
                                        className="btn-ghost-sm"
                                        style={{ marginLeft: 'auto' }}
                                        onClick={() => toggleGroup(groupCombos)}
                                    >
                                        {groupCombos.every(c => batchExcluded.has(c.key)) ? 'Chọn nhóm' : 'Bỏ chọn nhóm'}
                                    </button>
                                </div>
                                <div className="batch-preview-grid">
                                    {groupCombos.map(renderComboItem)}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="batch-preview-grid">
                        {combos.map(renderComboItem)}
                    </div>
                )}
                <div className="batch-modal-footer">
                    <button className="btn-secondary" onClick={onClose}>Huỷ</button>
                    <button
                        className="btn-primary"
                        disabled={activeCount === 0}
                        onClick={() => onGenerate(batchExcluded)}
                    >
                        Xác nhận tạo {activeCount} mockup
                    </button>
                </div>
            </div>

            {/* Enlarged preview lightbox */}
            {enlargedCombo && (
                <div
                    className="batch-enlarged-overlay"
                    onClick={(e) => { e.stopPropagation(); setEnlargedKey(null); }}
                >
                    <div className="batch-enlarged-content" onClick={(e) => e.stopPropagation()}>
                        <BatchPreviewCanvas
                            templateImageUrl={enlargedCombo.template.imageUrl}
                            designImageUrl={enlargedCombo.overlay ? (enlargedCombo.template.designOverlay?.imageUrl ?? enlargedCombo.variation.imageUrl) : enlargedCombo.overlayMask ? (enlargedCombo.template.designOverlay?.imageUrl ?? enlargedCombo.variation.imageUrl) : enlargedCombo.variation.imageUrl}
                            mask={enlargedCombo.overlayMask ?? enlargedCombo.template.mask!}
                            overlay={enlargedCombo.overlay}
                            width={800}
                        />
                        <div className="batch-enlarged-caption">
                            {enlargedCombo.template.name} × {enlargedCombo.variation.styleName}
                        </div>
                        <button
                            className="btn-secondary batch-enlarged-close"
                            onClick={() => setEnlargedKey(null)}
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
