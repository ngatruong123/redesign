'use client';

import { useState } from 'react';
import BatchPreviewCanvas from '../BatchPreviewCanvas';
import type { MockupTemplate, GeneratedVariation, MockupMask } from '@/types';

interface BatchPreviewModalProps {
    mockupTemplates: MockupTemplate[];
    selectedVariations: GeneratedVariation[];
    onClose: () => void;
    onGenerate: (excludedKeys: Set<string>) => void;
}

export default function BatchPreviewModal({
    mockupTemplates,
    selectedVariations,
    onClose,
    onGenerate,
}: BatchPreviewModalProps) {
    const [batchExcluded, setBatchExcluded] = useState<Set<string>>(new Set());

    const combos = mockupTemplates
        .filter((t) => t.mask || t.designOverlay)
        .flatMap((t): { key: string; template: MockupTemplate; variation: GeneratedVariation; overlayMask: MockupMask | undefined; overlay?: { x: number; y: number; width: number; height: number; rotation: number } }[] => {
            if (t.designOverlay) {
                const ov = t.designOverlay;
                const v = selectedVariations.find(sv => sv.id === ov.variationId);
                if (!v) return [];

                if (t.mask) {
                    // Has both mask and overlay
                    return [{
                        key: `${t.id}__${v.id}`,
                        template: t,
                        variation: v,
                        overlayMask: undefined,
                        overlay: { x: ov.x, y: ov.y, width: ov.width, height: ov.height, rotation: ov.rotation },
                    }];
                } else {
                    // Overlay only — use overlay rect as mask
                    return [{
                        key: `${t.id}__${v.id}`,
                        template: t,
                        variation: v,
                        overlayMask: {
                            x: ov.x, y: ov.y, width: ov.width, height: ov.height,
                            rotation: ov.rotation, mode: 'rect' as const,
                            fitMode: 'fill' as const, blendMode: 'normal' as const,
                            opacity: 100,
                        } as MockupMask,
                    }];
                }
            }
            return selectedVariations.map((v) => ({
                key: `${t.id}__${v.id}`,
                template: t,
                variation: v,
                overlayMask: undefined,
            }));
        });

    const activeCount = combos.filter(c => !batchExcluded.has(c.key)).length;

    const toggleBatchItem = (key: string) => {
        setBatchExcluded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    return (
        <div className="batch-preview-overlay" onClick={onClose}>
            <div className="batch-preview-modal" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Preview mockup combinations</h3>
                    <button className="btn-icon-sm" onClick={onClose}>✕</button>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Bỏ chọn combo bạn không muốn tạo. Click vào ảnh để toggle.
                </p>
                <div className="batch-preview-grid">
                    {combos.map(({ key, template, variation, overlayMask, overlay }) => {
                        const isChecked = !batchExcluded.has(key);
                        return (
                            <div
                                key={key}
                                className={`batch-preview-item ${isChecked ? 'checked' : ''}`}
                                onClick={() => toggleBatchItem(key)}
                            >
                                {isChecked && <div className="batch-preview-check">✓</div>}
                                <BatchPreviewCanvas
                                    templateImageUrl={template.imageUrl}
                                    designImageUrl={overlay ? (template.designOverlay?.imageUrl ?? variation.imageUrl) : overlayMask ? (template.designOverlay?.imageUrl ?? variation.imageUrl) : variation.imageUrl}
                                    mask={overlayMask ?? template.mask!}
                                    overlay={overlay}
                                />
                                <div className="batch-preview-item-label">
                                    {template.name} × {variation.styleName}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
        </div>
    );
}
