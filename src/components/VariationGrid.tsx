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
        sourceDesign, variations, setVariations, setStep,
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

    // Generate: 1 variation per selected style (streaming)
    const handleGenerate = async () => {
        if (!sourceDesign || selectedStyles.size === 0) return;
        setIsGenerating(true);
        setError(null);

        const styles = STYLE_PRESETS.filter((s) => selectedStyles.has(s.id));

        const placeholders = styles.map((s) => ({
            id: s.id,
            styleId: s.id,
            styleName: s.name,
            imageUrl: '',
            selected: false,
            loading: true,
        }));
        setVariations(placeholders);
        setStreamProgress({ done: 0, total: styles.length });

        try {
            const res = await fetch('/api/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceImageUrl: sourceDesign.url,
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
                        setStreamProgress({ done: doneCount, total: styles.length });
                        updateVariation(variation.styleId, {
                            imageUrl: variation.imageUrl,
                            loading: false,
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
    const handleRegenerate = async (styleId: string) => {
        if (!sourceDesign) return;
        const style = STYLE_PRESETS.find((s) => s.id === styleId);
        if (!style) return;

        updateVariation(styleId, { loading: true, imageUrl: '' });

        try {
            const res = await fetch('/api/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceImageUrl: sourceDesign.url,
                    styles: [style],
                    additionalPrompt,
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
                        const variation = JSON.parse(jsonStr);
                        updateVariation(variation.styleId, {
                            imageUrl: variation.imageUrl,
                            loading: false,
                        });
                    } catch {
                        // skip
                    }
                }
            }
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Regeneration failed');
            updateVariation(styleId, { loading: false });
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
            {sourceDesign && (
                <div className="source-preview-mini zoomable" onClick={() => setLightboxImage({ url: sourceDesign.url, alt: sourceDesign.name })}>
                    <img src={sourceDesign.url} alt={sourceDesign.name} />
                    <span>{sourceDesign.name}</span>
                    <span className="zoom-hint">{Icons.search}</span>
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
                <label>Prompt bổ sung (tùy chọn)</label>
                <div className="prompt-input-row">
                    <input
                        type="text"
                        placeholder="VD: thêm hoa văn, đổi màu nền..."
                        value={additionalPrompt}
                        onChange={(e) => setAdditionalPrompt(e.target.value)}
                        disabled={isGenerating}
                    />
                    <button
                        className="btn-primary"
                        onClick={handleGenerate}
                        disabled={isGenerating || selectedStyles.size === 0}
                    >
                        {isGenerating && streamProgress
                            ? <><span className="spinner-sm" /> {streamProgress.done}/{streamProgress.total} hoàn thành</>
                            : isGenerating
                                ? <><span className="spinner-sm" /> Đang tạo...</>
                                : `Tạo ${selectedStyles.size} biến thể`}
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

                    <div className="variation-grid">
                        {variations.map((variation) => (
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
                                        {/* Checkbox top-left */}
                                        <div
                                            className={`variation-check ${variation.selected ? 'checked' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); toggleVariation(variation.id); }}
                                        >
                                            {variation.selected && '✓'}
                                        </div>

                                        {/* BG removed badge */}
                                        {bgRemoved.has(variation.id) && (
                                            <span className="variation-badge-nobg">No BG</span>
                                        )}

                                        {/* Image area */}
                                        <div className={`variation-image-wrap ${bgRemoved.has(variation.id) ? 'checkerboard' : ''}`}>
                                            <img src={variation.imageUrl} alt={variation.styleName} />

                                            {/* Hover toolbar overlay */}
                                            <div className="variation-toolbar">
                                                <button
                                                    className="vtool-btn"
                                                    title="Phóng to"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLightboxImage({ url: variation.imageUrl, alt: variation.styleName });
                                                    }}
                                                >{Icons.search}</button>
                                                <button
                                                    className="vtool-btn"
                                                    title="Tạo lại"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRegenerate(variation.styleId);
                                                    }}
                                                >{Icons.refresh}</button>
                                                <button
                                                    className={`vtool-btn ${bgRemoved.has(variation.id) ? 'vtool-active' : ''}`}
                                                    title={bgRemoved.has(variation.id) ? 'Khôi phục nền' : 'Xoá nền nhanh'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleBg(variation.id, variation.imageUrl);
                                                    }}
                                                    disabled={bgProcessing.has(variation.id)}
                                                >
                                                    {bgProcessing.has(variation.id) ? <span className="spinner-sm" /> : bgRemoved.has(variation.id) ? Icons.undo : Icons.scissors}
                                                </button>
                                                <button
                                                    className="vtool-btn"
                                                    title="Xoá nền (tuỳ chỉnh)"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenRemoveBg(variation.id, variation.imageUrl);
                                                    }}
                                                >{Icons.wand}</button>
                                                <a
                                                    className="vtool-btn"
                                                    title="Tải xuống"
                                                    href={`/api/download/${encodeURIComponent(variation.styleName + '.png')}?source=${encodeURIComponent(variation.imageUrl)}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                >{Icons.download}</a>
                                            </div>
                                        </div>

                                        {/* Footer: style name only */}
                                        <div className="variation-card-footer">
                                            <span className="variation-label">{variation.styleName}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="variation-error">
                                        <span>⚠️</span>
                                        <p>Lỗi</p>
                                        <button
                                            className="btn-ghost-sm"
                                            style={{ marginTop: 4 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRegenerate(variation.styleId);
                                            }}
                                        >
                                            Thử lại
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

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
