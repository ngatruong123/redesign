'use client';

import type { GeneratedVariation } from '@/types';
import { Icons } from '../icons';
import Skeleton from '../ui/Skeleton';

interface VariationCardProps {
    variation: GeneratedVariation;
    bgRemoved: boolean;
    bgProcessing: boolean;
    onToggleSelection: (id: string) => void;
    onLightbox: (url: string, alt: string) => void;
    onRegenerate: (id: string) => void;
    onToggleBg: (id: string, imageUrl: string) => void;
    onOpenRemoveBg: (id: string, imageUrl: string) => void;
}

export default function VariationCard({
    variation,
    bgRemoved,
    bgProcessing,
    onToggleSelection,
    onLightbox,
    onRegenerate,
    onToggleBg,
    onOpenRemoveBg,
}: VariationCardProps) {
    return (
        <div
            className={`variation-card ${variation.selected ? 'selected' : ''} ${variation.loading ? 'loading' : ''}`}
            onClick={() => !variation.loading && onToggleSelection(variation.id)}
        >
            {variation.loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton width="100%" height={0} className="variation-skeleton-img" borderRadius="var(--radius-sm)" />
                    <div style={{ padding: '8px 12px' }}>
                        <Skeleton width="60%" height={12} borderRadius={6} />
                    </div>
                </div>
            ) : variation.imageUrl ? (
                <>
                    <div
                        className={`variation-check ${variation.selected ? 'checked' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggleSelection(variation.id); }}
                    >
                        {variation.selected && '✓'}
                    </div>

                    {bgRemoved && (
                        <span className="variation-badge-nobg">No BG</span>
                    )}

                    <div className={`variation-image-wrap ${bgRemoved ? 'checkerboard' : ''}`}>
                        <img src={variation.imageUrl} alt={variation.styleName} />

                        <div className="variation-toolbar">
                            <button className="vtool-btn" title="Phóng to" onClick={(e) => { e.stopPropagation(); onLightbox(variation.imageUrl, variation.styleName); }}>{Icons.search}</button>
                            <button className="vtool-btn" title="Tạo lại" onClick={(e) => { e.stopPropagation(); onRegenerate(variation.id); }}>{Icons.refresh}</button>
                            <button
                                className={`vtool-btn ${bgRemoved ? 'vtool-active' : ''}`}
                                title={bgRemoved ? 'Khôi phục nền' : 'Xoá nền nhanh'}
                                onClick={(e) => { e.stopPropagation(); onToggleBg(variation.id, variation.imageUrl); }}
                                disabled={bgProcessing}
                            >
                                {bgProcessing ? <span className="spinner-sm" /> : bgRemoved ? Icons.undo : Icons.scissors}
                            </button>
                            <button className="vtool-btn" title="Xoá nền (tuỳ chỉnh)" onClick={(e) => { e.stopPropagation(); onOpenRemoveBg(variation.id, variation.imageUrl); }}>{Icons.wand}</button>
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
                    <button className="btn-ghost-sm" style={{ marginTop: 4 }} onClick={(e) => { e.stopPropagation(); onRegenerate(variation.id); }}>Thử lại</button>
                </div>
            )}
        </div>
    );
}
