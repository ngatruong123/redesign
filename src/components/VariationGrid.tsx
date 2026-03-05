'use client';

import { useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { DEFAULT_STYLE_PRESETS } from '@/lib/prompt-engine';
import Lightbox from './Lightbox';
import RemoveBgPanel from './RemoveBgPanel';
import StyleSelector from './variation/StyleSelector';
import VariationCard from './variation/VariationCard';
import GenerationControls from './variation/GenerationControls';

const STYLE_PRESETS = DEFAULT_STYLE_PRESETS;

export default function VariationGrid() {
    const {
        sourceDesigns, variations, setVariations, setStep,
        isGenerating, setIsGenerating, setError, updateVariation,
        toggleVariationSelection, selectAllVariations, deselectAllVariations,
    } = useWorkflowStore();

    const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
    const [removeBgTarget, setRemoveBgTarget] = useState<{ id: string; imageUrl: string } | null>(null);
    const [originalUrls, setOriginalUrls] = useState<Record<string, string>>({});
    const [bgRemoved, setBgRemoved] = useState<Set<string>>(new Set());
    const [bgProcessing, setBgProcessing] = useState<Set<string>>(new Set());
    const addToast = useToastStore((s) => s.addToast);
    const [streamProgress, setStreamProgress] = useState<{ done: number; total: number } | null>(null);
    const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('2K');
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');

    const toggleStyle = (id: string) => {
        setSelectedStyles((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Generate: 1 variation per selected style × source image (streaming), or 1 from custom prompt
    const handleGenerate = async () => {
        if (sourceDesigns.length === 0) return;

        let styles: { id: string; name: string; prompt: string; icon?: string }[];
        if (selectedStyles.size > 0) {
            styles = STYLE_PRESETS.filter((s) => selectedStyles.has(s.id));
        } else if (additionalPrompt.trim()) {
            const customId = `custom-${Date.now()}`;
            styles = [{ id: customId, name: additionalPrompt.trim().slice(0, 40), prompt: additionalPrompt.trim() }];
        } else {
            return;
        }

        setIsGenerating(true);
        setError(null);

        const placeholders = sourceDesigns.flatMap((design) =>
            styles.map((s) => ({
                id: `${design.id}_${s.id}`,
                styleId: s.id,
                styleName: s.name,
                imageUrl: '',
                selected: false,
                loading: true,
                sourceDesignId: design.id,
            }))
        );
        setVariations(placeholders);
        const totalCount = placeholders.length;
        setStreamProgress({ done: 0, total: totalCount });

        try {
            const sourceImageUrls = sourceDesigns.map((d) => ({ id: d.id, url: d.url }));
            const res = await fetch('/api/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceImageUrls,
                    styles,
                    additionalPrompt,
                    imageSize,
                    aspectRatio,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Generation failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream');

            const decoder = new TextDecoder();
            let buffer = '';
            let doneCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr || jsonStr === '[DONE]') continue;
                    try {
                        const variation = JSON.parse(jsonStr);
                        doneCount++;
                        setStreamProgress({ done: doneCount, total: totalCount });
                        const compositeId = `${variation.sourceDesignId}_${variation.styleId}`;
                        updateVariation(compositeId, {
                            imageUrl: variation.imageUrl,
                            loading: false,
                            sourceDesignId: variation.sourceDesignId,
                        });
                    } catch {
                        // skip malformed SSE
                    }
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Generation failed';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsGenerating(false);
            setStreamProgress(null);
        }
    };

    const handleRegenerate = async (variationId: string) => {
        const v = variations.find((v) => v.id === variationId);
        if (!v) return;

        const sourceDesign = sourceDesigns.find((d) => d.id === v.sourceDesignId) || sourceDesigns[0];
        if (!sourceDesign) return;

        let style = STYLE_PRESETS.find((s) => s.id === v.styleId);
        if (!style) {
            style = { id: v.styleId, name: v.styleName, prompt: v.styleName, icon: '' };
        }

        updateVariation(variationId, { loading: true, imageUrl: '' });

        try {
            const res = await fetch('/api/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceImageUrls: [{ id: sourceDesign.id, url: sourceDesign.url }],
                    styles: [style],
                    additionalPrompt: style.id.startsWith('custom-') ? '' : additionalPrompt,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Regeneration failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr || jsonStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        updateVariation(variationId, {
                            imageUrl: parsed.imageUrl,
                            loading: false,
                        });
                    } catch {
                        // skip
                    }
                }
            }
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Regeneration failed');
            updateVariation(variationId, { loading: false });
        }
    };

    const handleOpenRemoveBg = useCallback((variationId: string, imageUrl: string) => {
        setRemoveBgTarget({ id: variationId, imageUrl });
    }, []);

    const handleToggleBg = useCallback(async (variationId: string, currentUrl: string) => {
        if (bgProcessing.has(variationId)) return;

        if (bgRemoved.has(variationId)) {
            const orig = originalUrls[variationId];
            if (orig) {
                updateVariation(variationId, { imageUrl: orig });
                setBgRemoved((prev) => { const next = new Set(prev); next.delete(variationId); return next; });
            }
            return;
        }

        setOriginalUrls((prev) => ({ ...prev, [variationId]: currentUrl }));
        setBgProcessing((prev) => new Set(prev).add(variationId));

        try {
            const res = await fetch('/api/remove-bg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: currentUrl, mode: 'transparent' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            updateVariation(variationId, { imageUrl: data.url });
            setBgRemoved((prev) => new Set(prev).add(variationId));
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Xoá nền thất bại');
        } finally {
            setBgProcessing((prev) => { const next = new Set(prev); next.delete(variationId); return next; });
        }
    }, [bgProcessing, bgRemoved, originalUrls, updateVariation, addToast]);

    const selectedCount = variations.filter((v) => v.selected).length;

    const toggleVariation = (id: string) => toggleVariationSelection(id);
    const selectAll = () => selectAllVariations();
    const deselectAll = () => deselectAllVariations();

    return (
        <div className="variation-container">
            {sourceDesigns.length > 0 && (
                <div className="source-previews-row">
                    {sourceDesigns.map((d) => (
                        <div key={d.id} className="source-preview-mini zoomable" onClick={() => setLightboxImage({ url: d.url, alt: d.name })}>
                            <img src={d.url} alt={d.name} />
                            <span>{d.name}</span>
                        </div>
                    ))}
                </div>
            )}

            <StyleSelector
                presets={STYLE_PRESETS}
                selectedStyles={selectedStyles}
                onToggleStyle={toggleStyle}
                onSelectAll={() => setSelectedStyles(new Set(STYLE_PRESETS.map((s) => s.id)))}
                onDeselectAll={() => setSelectedStyles(new Set())}
                disabled={isGenerating}
            />

            <GenerationControls
                selectedStyleCount={selectedStyles.size}
                additionalPrompt={additionalPrompt}
                onAdditionalPromptChange={setAdditionalPrompt}
                isGenerating={isGenerating}
                streamProgress={streamProgress}
                onGenerate={handleGenerate}
                imageSize={imageSize}
                onImageSizeChange={setImageSize}
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
            />

            {/* Variation grid */}
            {variations.length > 0 && (
                <>
                    <div className="variation-header">
                        <div className="variation-header-left">
                            <h2>Kết quả</h2>
                            {selectedCount > 0 && <span className="selected-count">{selectedCount} đã chọn</span>}
                        </div>
                        <div className="variation-header-right">
                            <button className="btn-ghost-sm" onClick={selectAll}>Chọn tất cả</button>
                            <button className="btn-ghost-sm" onClick={deselectAll}>Bỏ chọn</button>
                        </div>
                    </div>

                    {/* Group variations by source design */}
                    {sourceDesigns.map((design) => {
                        const group = variations.filter((v) => v.sourceDesignId === design.id);
                        if (group.length === 0) return null;
                        return (
                            <div key={design.id} className="variation-group">
                                {sourceDesigns.length > 1 && (
                                    <div className="variation-group-header">
                                        <img src={design.url} alt={design.name} className="variation-group-thumb" />
                                        <span>{design.name}</span>
                                    </div>
                                )}
                                <div className="variation-grid">
                                    {group.map((variation) => (
                                        <VariationCard
                                            key={variation.id}
                                            variation={variation}
                                            bgRemoved={bgRemoved.has(variation.id)}
                                            bgProcessing={bgProcessing.has(variation.id)}
                                            onToggleSelection={toggleVariation}
                                            onLightbox={(url, alt) => setLightboxImage({ url, alt })}
                                            onRegenerate={handleRegenerate}
                                            onToggleBg={handleToggleBg}
                                            onOpenRemoveBg={handleOpenRemoveBg}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {/* Fallback for variations without sourceDesignId */}
                    {(() => {
                        const ungrouped = variations.filter((v) => !v.sourceDesignId || !sourceDesigns.find((d) => d.id === v.sourceDesignId));
                        if (ungrouped.length === 0) return null;
                        return (
                            <div className="variation-grid">
                                {ungrouped.map((variation) => (
                                    <VariationCard
                                        key={variation.id}
                                        variation={variation}
                                        bgRemoved={bgRemoved.has(variation.id)}
                                        bgProcessing={bgProcessing.has(variation.id)}
                                        onToggleSelection={toggleVariation}
                                        onLightbox={(url, alt) => setLightboxImage({ url, alt })}
                                        onRegenerate={handleRegenerate}
                                        onToggleBg={handleToggleBg}
                                        onOpenRemoveBg={handleOpenRemoveBg}
                                    />
                                ))}
                            </div>
                        );
                    })()}

                    <div className="variation-footer">
                        <button className="btn-ghost" onClick={() => setStep('upload')}>← Quay lại</button>
                        <button
                            className="btn-primary btn-lg"
                            onClick={() => setStep('mockup')}
                            disabled={selectedCount === 0}
                        >
                            Tiếp tục với {selectedCount} biến thể →
                        </button>
                    </div>
                </>
            )}

            {variations.length === 0 && !isGenerating && (
                <div className="variation-empty">
                    <div className="empty-icon">✨</div>
                    <h3>Chọn style và bấm Tạo biến thể</h3>
                    <p>AI sẽ tạo 1 biến thể cho mỗi phong cách bạn chọn</p>
                </div>
            )}

            {lightboxImage && (
                <Lightbox imageUrl={lightboxImage.url} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
            )}

            {removeBgTarget && (
                <RemoveBgPanel
                    imageUrl={removeBgTarget.imageUrl}
                    onResult={(newUrl) => {
                        updateVariation(removeBgTarget.id, { imageUrl: newUrl });
                        setRemoveBgTarget(null);
                    }}
                    onClose={() => setRemoveBgTarget(null)}
                />
            )}
        </div>
    );
}
