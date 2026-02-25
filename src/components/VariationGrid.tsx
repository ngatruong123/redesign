'use client';

import { useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { DEFAULT_STYLE_PRESETS } from '@/lib/prompt-engine';
import Lightbox from './Lightbox';
import RemoveBgPanel from './RemoveBgPanel';

const STYLE_PRESETS = DEFAULT_STYLE_PRESETS;

// SVG Icons (monochrome, 16×16)
const Icons = {
    search: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>,
    refresh: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 8a5.5 5.5 0 0 1 9.9-3.2M13.5 8a5.5 5.5 0 0 1-9.9 3.2"/><path d="M12.5 2v3h-3M3.5 14v-3h3"/></svg>,
    scissors: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="4" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><path d="M5.8 5.5L14 12M5.8 10.5L14 4"/></svg>,
    wand: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 14L10 6M7 3l1-2 1 2 2 1-2 1-1 2-1-2-2-1z"/><path d="M12.5 7.5l.5-1 .5 1 1 .5-1 .5-.5 1-.5-1-1-.5z"/></svg>,
    download: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M3 13h10"/></svg>,
    undo: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 6l-3 3 3 3"/><path d="M1 9h9a4 4 0 0 0 0-8H8"/></svg>,
};

export default function VariationGrid() {
    const {
        sourceDesigns, variations, setVariations, setStep,
        isGenerating, setIsGenerating, setError, updateVariation,
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

        // Build styles list: selected presets + custom prompt if no presets selected
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

        // Create placeholders: for each source × style
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
                        // Match by composite id (sourceDesignId_styleId)
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

    // Regenerate a single variation
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

    // Open BG removal panel for a variation
    const handleOpenRemoveBg = useCallback((variationId: string, imageUrl: string) => {
        setRemoveBgTarget({ id: variationId, imageUrl });
    }, []);

    // Quick toggle: remove bg (transparent) or restore original
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

    const toggleVariation = (id: string) => {
        setVariations(variations.map((v) => v.id === id ? { ...v, selected: !v.selected } : v));
    };
    const selectAll = () => setVariations(variations.map((v) => v.imageUrl ? { ...v, selected: true } : v));
    const deselectAll = () => setVariations(variations.map((v) => ({ ...v, selected: false })));

    return (
        <div className="variation-container">
            {sourceDesigns.length > 0 && (
                <div className="source-previews-row">
                    {sourceDesigns.map((d) => (
                        <div key={d.id} className="source-preview-mini zoomable" onClick={() => setLightboxImage({ url: d.url, alt: d.name })}>
                            <img src={d.url} alt={d.name} />
                            <span>{d.name}</span>
                            <span className="zoom-hint">{Icons.search}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Style picker */}
            <div className="style-picker">
                <div className="style-picker-header">
                    <h3>Chọn phong cách ({selectedStyles.size}/{STYLE_PRESETS.length})</h3>
                    <div className="style-picker-actions">
                        {selectedStyles.size > 0 && <span className="style-picker-count">{selectedStyles.size} selected</span>}
                        <button className="btn-ghost-sm" onClick={() => setSelectedStyles(new Set(STYLE_PRESETS.map((s) => s.id)))}>Chọn tất cả</button>
                        <button className="btn-ghost-sm" onClick={() => setSelectedStyles(new Set())}>Bỏ chọn</button>
                    </div>
                </div>
                <div className="style-chips">
                    {STYLE_PRESETS.map((style) => (
                        <button
                            key={style.id}
                            className={`style-chip ${selectedStyles.has(style.id) ? 'picked' : ''}`}
                            onClick={() => toggleStyle(style.id)}
                            disabled={isGenerating}
                        >
                            <span className="style-chip-icon">{style.icon}</span>
                            <span className="style-chip-name">{style.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Prompt & Generate */}
            <div className="prompt-section">
                <label>{selectedStyles.size > 0 ? 'Prompt bổ sung (tùy chọn)' : 'Nhập prompt để tạo ảnh'}</label>
                <div className="prompt-input-row">
                    <input
                        type="text"
                        placeholder={selectedStyles.size > 0 ? 'VD: thêm hoa văn, đổi màu nền...' : 'VD: chuyển sang phong cách watercolor, thêm hoa...'}
                        value={additionalPrompt}
                        onChange={(e) => setAdditionalPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !isGenerating) handleGenerate(); }}
                        disabled={isGenerating}
                    />
                    <button
                        className="btn-primary"
                        onClick={handleGenerate}
                        disabled={isGenerating || (selectedStyles.size === 0 && !additionalPrompt.trim())}
                    >
                        {isGenerating && streamProgress
                            ? <><span className="spinner-sm" /> {streamProgress.done}/{streamProgress.total} hoàn thành</>
                            : isGenerating
                                ? <><span className="spinner-sm" /> Đang tạo...</>
                                : selectedStyles.size > 0
                                    ? `Tạo ${selectedStyles.size} biến thể`
                                    : 'Tạo từ prompt'}
                    </button>
                </div>
            </div>

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
                                        <div
                                            key={variation.id}
                                            className={`variation-card ${variation.selected ? 'selected' : ''} ${variation.loading ? 'loading' : ''}`}
                                            onClick={() => !variation.loading && toggleVariation(variation.id)}
                                        >
                                            {variation.loading ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    <div className="skeleton" style={{ aspectRatio: '1', width: '100%' }} />
                                                    <div style={{ padding: '8px 12px' }}>
                                                        <div className="skeleton-text" />
                                                    </div>
                                                </div>
                                            ) : variation.imageUrl ? (
                                                <>
                                                    <div
                                                        className={`variation-check ${variation.selected ? 'checked' : ''}`}
                                                        onClick={(e) => { e.stopPropagation(); toggleVariation(variation.id); }}
                                                    >
                                                        {variation.selected && '✓'}
                                                    </div>

                                                    {bgRemoved.has(variation.id) && (
                                                        <span className="variation-badge-nobg">No BG</span>
                                                    )}

                                                    <div className={`variation-image-wrap ${bgRemoved.has(variation.id) ? 'checkerboard' : ''}`}>
                                                        <img src={variation.imageUrl} alt={variation.styleName} />

                                                        <div className="variation-toolbar">
                                                            <button className="vtool-btn" title="Phóng to" onClick={(e) => { e.stopPropagation(); setLightboxImage({ url: variation.imageUrl, alt: variation.styleName }); }}>{Icons.search}</button>
                                                            <button className="vtool-btn" title="Tạo lại" onClick={(e) => { e.stopPropagation(); handleRegenerate(variation.id); }}>{Icons.refresh}</button>
                                                            <button
                                                                className={`vtool-btn ${bgRemoved.has(variation.id) ? 'vtool-active' : ''}`}
                                                                title={bgRemoved.has(variation.id) ? 'Khôi phục nền' : 'Xoá nền nhanh'}
                                                                onClick={(e) => { e.stopPropagation(); handleToggleBg(variation.id, variation.imageUrl); }}
                                                                disabled={bgProcessing.has(variation.id)}
                                                            >
                                                                {bgProcessing.has(variation.id) ? <span className="spinner-sm" /> : bgRemoved.has(variation.id) ? Icons.undo : Icons.scissors}
                                                            </button>
                                                            <button className="vtool-btn" title="Xoá nền (tuỳ chỉnh)" onClick={(e) => { e.stopPropagation(); handleOpenRemoveBg(variation.id, variation.imageUrl); }}>{Icons.wand}</button>
                                                            <a className="vtool-btn" title="Tải xuống" href={`/api/download/${encodeURIComponent(variation.styleName + '.png')}?source=${encodeURIComponent(variation.imageUrl)}`} onClick={(e) => e.stopPropagation()}>{Icons.download}</a>
                                                        </div>
                                                    </div>

                                                    <div className="variation-card-footer">
                                                        <span className="variation-label">{variation.styleName}</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="variation-error">
                                                    <span>⚠️</span>
                                                    <p>Lỗi</p>
                                                    <button className="btn-ghost-sm" style={{ marginTop: 4 }} onClick={(e) => { e.stopPropagation(); handleRegenerate(variation.id); }}>Thử lại</button>
                                                </div>
                                            )}
                                        </div>
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
                                    <div
                                        key={variation.id}
                                        className={`variation-card ${variation.selected ? 'selected' : ''} ${variation.loading ? 'loading' : ''}`}
                                        onClick={() => !variation.loading && toggleVariation(variation.id)}
                                    >
                                        {variation.loading ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <div className="skeleton" style={{ aspectRatio: '1', width: '100%' }} />
                                                <div style={{ padding: '8px 12px' }}><div className="skeleton-text" /></div>
                                            </div>
                                        ) : variation.imageUrl ? (
                                            <>
                                                <div className={`variation-check ${variation.selected ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); toggleVariation(variation.id); }}>{variation.selected && '✓'}</div>
                                                <div className="variation-image-wrap"><img src={variation.imageUrl} alt={variation.styleName} /></div>
                                                <div className="variation-card-footer"><span className="variation-label">{variation.styleName}</span></div>
                                            </>
                                        ) : (
                                            <div className="variation-error"><span>⚠️</span><p>Lỗi</p></div>
                                        )}
                                    </div>
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
