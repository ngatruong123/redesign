'use client';

import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { v4 as uuidv4 } from 'uuid';
import { Icons } from '../icons';
import type { GeneratedMockup } from '@/types';

interface GeneratedMockupsGridProps {
    generatedMockups: GeneratedMockup[];
    setLightboxImage: (img: { url: string; alt: string } | null) => void;
    setSeoMockupId: (id: string | null) => void;
    onRetry: () => void;
}

function makeSafeFilename(templateName: string, variationName: string) {
    return `${templateName}-${variationName}.png`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function triggerDownload(imageUrl: string, filename: string) {
    if (!imageUrl) return;
    if (imageUrl.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = filename;
        a.click();
    } else {
        window.location.href = `/api/download/${encodeURIComponent(filename)}?source=${encodeURIComponent(imageUrl)}`;
    }
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, b64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

export default function GeneratedMockupsGrid({
    generatedMockups,
    setLightboxImage,
    setSeoMockupId,
    onRetry,
}: GeneratedMockupsGridProps) {
    const addToast = useToastStore((s) => s.addToast);
    const [selectedMockupIds, setSelectedMockupIds] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState(false);

    const toggleMockupSelection = (id: string) => {
        setSelectedMockupIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAllMockups = () => {
        setSelectedMockupIds(new Set(generatedMockups.filter((m) => m.imageUrl).map((m) => m.id)));
    };

    const handleDownloadSelected = async () => {
        const toDownload = generatedMockups.filter((m) => selectedMockupIds.has(m.id) && m.imageUrl);
        if (toDownload.length === 0) return;
        if (toDownload.length === 1) {
            triggerDownload(toDownload[0].imageUrl, makeSafeFilename(toDownload[0].templateName, toDownload[0].variationName));
            return;
        }
        setDownloading(true);
        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            let failed = 0;
            for (const mockup of toDownload) {
                try {
                    let blob: Blob;
                    if (mockup.imageUrl.startsWith('data:')) {
                        blob = dataUrlToBlob(mockup.imageUrl);
                    } else {
                        const res = await fetch(mockup.imageUrl);
                        if (!res.ok) { failed++; continue; }
                        blob = await res.blob();
                    }
                    if (blob.size === 0) { failed++; continue; }
                    zip.file(makeSafeFilename(mockup.templateName, mockup.variationName).replace('.png', `_${mockup.id.slice(0, 8)}.png`), blob);
                } catch {
                    failed++;
                }
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const { saveAs } = await import('file-saver');
            saveAs(zipBlob, 'mockups.zip');
            if (failed > 0) addToast('warning', `${failed}/${toDownload.length} ảnh không tải được`);
        } catch (err) {
            addToast('error', `Tải ZIP thất bại: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally {
            setDownloading(false);
        }
    };

    const selectedMockupCount = selectedMockupIds.size;

    return (
        <div className="generated-mockups-section">
            <div className="generated-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{Icons.image} Mockups ({generatedMockups.length})</h3>
                <div className="generated-header-actions">
                    <button className="btn-ghost-sm" onClick={selectAllMockups}>Chọn tất cả</button>
                    <button className="btn-ghost-sm" onClick={() => setSelectedMockupIds(new Set())}>Bỏ chọn</button>
                    {selectedMockupCount > 0 && (
                        <button className="btn-primary" onClick={handleDownloadSelected} disabled={downloading}>
                            {downloading ? <><span className="spinner-sm" /> Đang tải...</> : <>{Icons.download} Tải {selectedMockupCount} ảnh</>}
                        </button>
                    )}
                </div>
            </div>
            <div className="generated-grid">
                {generatedMockups.map((mockup) => (
                    <div key={mockup.id} className={`generated-card ${selectedMockupIds.has(mockup.id) ? 'selected' : ''}`}>
                        {mockup.imageUrl ? (
                            <>
                                <div className="generated-image-wrap"
                                    onClick={() => setLightboxImage({ url: mockup.imageUrl, alt: `${mockup.templateName} - ${mockup.variationName}` })}>
                                    <img src={mockup.imageUrl} alt={`${mockup.templateName} - ${mockup.variationName}`} />
                                    <div className="zoom-overlay"><span>{Icons.search}</span></div>
                                </div>
                                <div className="generated-card-footer">
                                    <div className="generated-card-info">
                                        <span>{mockup.templateName}</span>
                                        <span className="dot">·</span>
                                        <span>{mockup.variationName}</span>
                                    </div>
                                    <div className="generated-card-actions">
                                        <button className="btn-icon-sm" title="Tạo Video" onClick={(e) => {
                                            e.stopPropagation();
                                            const { setVideoGeneration, setStep } = useWorkflowStore.getState();
                                            setVideoGeneration({
                                                id: uuidv4(),
                                                mockupId: mockup.id,
                                                mockupImageUrl: mockup.imageUrl,
                                                prompt: '',
                                                status: 'pending',
                                            });
                                            setStep('video');
                                        }}>{Icons.video}</button>
                                        <button className="btn-icon-sm" title="SEO Title & Description" onClick={(e) => {
                                            e.stopPropagation();
                                            setSeoMockupId(mockup.id);
                                        }} style={mockup.seo?.status === 'done' ? { color: 'var(--accent, #00e68a)' } : undefined}>
                                            {'📝'}
                                        </button>
                                        <button className="btn-icon-sm" title="Tải xuống" onClick={(e) => {
                                            e.stopPropagation();
                                            triggerDownload(mockup.imageUrl, makeSafeFilename(mockup.templateName, mockup.variationName));
                                        }}>{Icons.download}</button>
                                        <div className={`checkbox ${selectedMockupIds.has(mockup.id) ? 'checked' : ''}`}
                                            onClick={() => toggleMockupSelection(mockup.id)}>
                                            {selectedMockupIds.has(mockup.id) && '✓'}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="variation-error">
                                <span>⚠️</span>
                                <p>{mockup.error || 'Lỗi'}</p>
                                <button
                                    className="btn-ghost-sm"
                                    style={{ marginTop: 4 }}
                                    onClick={onRetry}
                                >
                                    Tạo lại
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
