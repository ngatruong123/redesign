'use client';

import { useState, useRef, useCallback } from 'react';
import { useToastStore } from '@/store/toast-store';
import { useWorkflowStore } from '@/store/workflow-store';
import type { GeneratedVariation } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface VariationsPanelProps {
    variations: GeneratedVariation[];
    setVariations: (v: GeneratedVariation[]) => void;
    toggleVariationSelection: (id: string) => void;
    setRemoveBgVariationId: (id: string | null) => void;
}

export default function VariationsPanel({
    variations,
    setVariations,
    toggleVariationSelection,
    setRemoveBgVariationId,
}: VariationsPanelProps) {
    const addToast = useToastStore((s) => s.addToast);
    const [uploadingDesigns, setUploadingDesigns] = useState(false);
    const [designDragActive, setDesignDragActive] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const designInputRef = useRef<HTMLInputElement>(null);

    const selectedVariations = variations.filter((v) => v.selected && v.imageUrl);

    const handleUploadDesigns = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        setUploadingDesigns(true);

        const uploads = imageFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return {
                id: uuidv4(),
                styleId: 'custom',
                styleName: file.name.replace(/\.[^.]+$/, ''),
                imageUrl: data.url,
                selected: true,
                loading: false,
            } satisfies GeneratedVariation;
        });

        const results = await Promise.allSettled(uploads);
        const newVariations: GeneratedVariation[] = [];
        for (const r of results) {
            if (r.status === 'fulfilled') newVariations.push(r.value);
        }
        if (newVariations.length > 0) {
            setVariations([...variations, ...newVariations]);
            addToast('success', `Đã thêm ${newVariations.length} ảnh thiết kế`);
        }
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) addToast('error', `${failed} file upload thất bại`);
        setUploadingDesigns(false);
    }, [variations, setVariations, addToast]);

    const handleDragStart = useCallback((e: React.DragEvent, variation: GeneratedVariation) => {
        setDraggingId(variation.id);
        e.dataTransfer.setData('application/x-variation-id', variation.id);
        e.dataTransfer.setData('text/uri-list', variation.imageUrl);
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggingId(null);
    }, []);

    return (
        <div className="sidebar-panel">
            <div className="sidebar-panel-header">
                <h3>Ảnh thiết kế ({selectedVariations.length}/{variations.length})</h3>
                <div
                    className={`mockup-upload-mini ${designDragActive ? 'drag-active' : ''}`}
                    onClick={() => designInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDesignDragActive(true); }}
                    onDragLeave={() => setDesignDragActive(false)}
                    onDrop={(e) => {
                        e.preventDefault(); setDesignDragActive(false);
                        if (e.dataTransfer.files.length > 0) handleUploadDesigns(e.dataTransfer.files);
                    }}
                >
                    <input ref={designInputRef} type="file" accept="image/*" multiple onChange={(e) => {
                        if (e.target.files) handleUploadDesigns(e.target.files);
                        e.target.value = '';
                    }} hidden />
                    {uploadingDesigns ? <><span className="spinner-sm" /> Đang upload...</> : '+ Thêm ảnh thiết kế'}
                </div>
            </div>
            <div className="sidebar-panel-scroll">
            <div className="selected-variations-mini">
                {variations.filter(v => v.imageUrl).map((v) => (
                    <div
                        key={v.id}
                        className="mini-variation"
                        draggable
                        onDragStart={(e) => handleDragStart(e, v)}
                        onDragEnd={handleDragEnd}
                        style={{
                            opacity: draggingId === v.id ? 0.4 : v.selected ? 1 : 0.4,
                            cursor: 'grab',
                            outline: v.selected ? '2px solid var(--accent, #00e68a)' : '2px solid transparent',
                            borderRadius: 6,
                            transition: 'opacity 0.15s, outline-color 0.15s',
                            position: 'relative',
                        }}
                    >
                        <img
                            src={v.imageUrl}
                            alt={v.styleName}
                            onClick={() => toggleVariationSelection(v.id)}
                            title="Kéo thả vào canvas hoặc click để chọn/bỏ chọn"
                        />
                        <span onClick={() => toggleVariationSelection(v.id)}>{v.styleName}</span>
                        <button
                            className="btn-icon-sm"
                            onClick={(e) => { e.stopPropagation(); setRemoveBgVariationId(v.id); }}
                            title="Tách nền"
                            style={{ fontSize: 11, padding: '2px 4px', flexShrink: 0 }}
                        >
                            ✂️
                        </button>
                        <button
                            className="btn-icon-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                // Clear overlay from templates that reference this variation
                                const { mockupTemplates, updateMockupTemplate } = useWorkflowStore.getState();
                                for (const t of mockupTemplates) {
                                    if (t.designOverlay?.variationId === v.id) {
                                        updateMockupTemplate(t.id, { designOverlay: null });
                                    }
                                }
                                setVariations(variations.filter(x => x.id !== v.id));
                            }}
                            title="Xoá"
                            style={{ fontSize: 11, padding: '2px 4px', flexShrink: 0 }}
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
            </div>
        </div>
    );
}
