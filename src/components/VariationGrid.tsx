'use client';

import { useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { DEFAULT_STYLE_PRESETS } from '@/lib/prompt-engine';
import { useVariationGeneration } from '@/hooks/useVariationGeneration';
import Lightbox from './Lightbox';
import RemoveBgPanel from './RemoveBgPanel';
import StyleSelector from './variation/StyleSelector';
import VariationCard from './variation/VariationCard';
import GenerationControls from './variation/GenerationControls';

const STYLE_PRESETS = DEFAULT_STYLE_PRESETS;

export default function VariationGrid() {
    const {
        sourceDesigns, variations, setStep,
        isGenerating, updateVariation,
        toggleVariationSelection, selectAllVariations, deselectAllVariations,
    } = useWorkflowStore();

    const {
        selectedStyles, setSelectedStyles, toggleStyle,
        additionalPrompt, setAdditionalPrompt,
        imageSize, setImageSize, aspectRatio, setAspectRatio,
        streamProgress, handleGenerate, handleRegenerate,
        bgRemoved, bgProcessing, handleToggleBg,
    } = useVariationGeneration();

    const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
    const [removeBgTarget, setRemoveBgTarget] = useState<{ id: string; imageUrl: string } | null>(null);

    const handleOpenRemoveBg = useCallback((variationId: string, imageUrl: string) => {
        setRemoveBgTarget({ id: variationId, imageUrl });
    }, []);

    const selectedCount = variations.filter((v) => v.selected).length;

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
                            <button className="btn-ghost-sm" onClick={selectAllVariations}>Chọn tất cả</button>
                            <button className="btn-ghost-sm" onClick={deselectAllVariations}>Bỏ chọn</button>
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
                                            onToggleSelection={toggleVariationSelection}
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
                                        onToggleSelection={toggleVariationSelection}
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
