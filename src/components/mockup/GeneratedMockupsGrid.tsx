'use client';

import { useState, useMemo, useCallback } from 'react';
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
    onEditMockup?: (mockup: GeneratedMockup) => void;
    editingMockupId?: string | null;
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

interface MockupGroup {
    sourceDesignId: string;
    sourceDesignName: string;
    sourceDesignUrl?: string;
    mockups: GeneratedMockup[];
}

export default function GeneratedMockupsGrid({
    generatedMockups,
    setLightboxImage,
    setSeoMockupId,
    onRetry,
    onEditMockup,
    editingMockupId,
}: GeneratedMockupsGridProps) {
    const addToast = useToastStore((s) => s.addToast);
    const sourceDesigns = useWorkflowStore((s) => s.sourceDesigns);
    const [selectedMockupIds, setSelectedMockupIds] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState(false);

    const variations = useWorkflowStore((s) => s.variations);

    // Resolve designId from mockup or variation ID
    const resolveDesignId = useCallback((m: GeneratedMockup) => {
        if (m.sourceDesignId) return m.sourceDesignId;
        const varId = m.variationId;
        if (varId) {
            const v = variations.find(v => v.id === varId);
            if (v?.sourceDesignId) return v.sourceDesignId;
            // Parse from variation ID format "{designId}_{styleId}"
            const idx = varId.lastIndexOf('_');
            if (idx > 0) return varId.slice(0, idx);
            // Match via sourceDesigns by checking other variations with same styleId
            if (v) {
                const allVars = variations.filter(ov => ov.sourceDesignId && ov.styleId === v.styleId);
                if (allVars.length > 0) return allVars[0].sourceDesignId;
            }
        }
        // Single design fallback
        if (sourceDesigns.length === 1) return sourceDesigns[0].id;
        return undefined;
    }, [variations, sourceDesigns]);

    const groups = useMemo<MockupGroup[]>(() => {
        const map = new Map<string, MockupGroup>();
        for (const m of generatedMockups) {
            const designId = resolveDesignId(m);
            const key = designId || '__unknown__';
            if (!map.has(key)) {
                const sd = sourceDesigns.find(d => d.id === designId);
                map.set(key, {
                    sourceDesignId: key,
                    sourceDesignName: m.sourceDesignName || sd?.name || key.slice(0, 8),
                    sourceDesignUrl: sd?.url,
                    mockups: [],
                });
            }
            map.get(key)!.mockups.push(m);
        }
        return Array.from(map.values());
    }, [generatedMockups, sourceDesigns, resolveDesignId]);

    const isMultiDesign = groups.length > 1;

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

    const selectGroupMockups = (group: MockupGroup) => {
        setSelectedMockupIds((prev) => {
            const next = new Set(prev);
            const groupIds = group.mockups.filter(m => m.imageUrl).map(m => m.id);
            const allSelected = groupIds.every(id => next.has(id));
            if (allSelected) {
                groupIds.forEach(id => next.delete(id));
            } else {
                groupIds.forEach(id => next.add(id));
            }
            return next;
        });
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

            // Check if multiple source designs
            const designIds = new Set(toDownload.map(m => resolveDesignId(m)).filter(Boolean));
            const useFolder = designIds.size > 1;

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
                    const filename = makeSafeFilename(mockup.templateName, mockup.variationName).replace('.png', `_${mockup.id.slice(0, 8)}.png`);
                    if (useFolder) {
                        const dId = resolveDesignId(mockup);
                        const group = groups.find(g => g.sourceDesignId === dId);
                        const folderName = (mockup.sourceDesignName || group?.sourceDesignName || 'Unknown').replace(/[^a-zA-Z0-9._-\s]/g, '_').trim();
                        zip.file(`${folderName}/${filename}`, blob);
                    } else {
                        zip.file(filename, blob);
                    }
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

    const renderMockupCard = (mockup: GeneratedMockup) => (
        <div key={mockup.id} className={`generated-card ${selectedMockupIds.has(mockup.id) ? 'selected' : ''} ${editingMockupId === mockup.id ? 'editing' : ''}`}>
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
                            {onEditMockup && mockup.templateId && (
                                <button className="btn-icon-sm" title="Chỉnh sửa" onClick={(e) => {
                                    e.stopPropagation();
                                    onEditMockup(mockup);
                                }} style={editingMockupId === mockup.id ? { color: 'var(--accent, #00e68a)' } : undefined}>
                                    {Icons.edit}
                                </button>
                            )}
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
    );

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
            {isMultiDesign ? (
                groups.map((group) => {
                    const groupIds = group.mockups.filter(m => m.imageUrl).map(m => m.id);
                    const allGroupSelected = groupIds.length > 0 && groupIds.every(id => selectedMockupIds.has(id));
                    return (
                        <div key={group.sourceDesignId} className="variation-group">
                            <div className="variation-group-header">
                                {group.sourceDesignUrl && (
                                    <img src={group.sourceDesignUrl} alt={group.sourceDesignName} className="variation-group-thumb" />
                                )}
                                <span>{group.sourceDesignName} ({group.mockups.length})</span>
                                <button
                                    className="btn-ghost-sm"
                                    style={{ marginLeft: 'auto' }}
                                    onClick={() => selectGroupMockups(group)}
                                >
                                    {allGroupSelected ? 'Bỏ chọn nhóm' : 'Chọn nhóm'}
                                </button>
                            </div>
                            <div className="generated-grid">
                                {group.mockups.map(renderMockupCard)}
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="generated-grid">
                    {generatedMockups.map(renderMockupCard)}
                </div>
            )}
        </div>
    );
}
