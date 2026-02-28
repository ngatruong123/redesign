'use client';

import { useState, useRef, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { v4 as uuidv4 } from 'uuid';
import RemoveBgButton from './RemoveBgButton';
import Lightbox from './Lightbox';
import ImageCropper from './ImageCropper';
import type { DesignFile } from '@/types';
import { uploadFile } from '@/app/actions/upload';

export default function UploadZone() {
    const { sourceDesigns, addSourceDesign, removeSourceDesign, startNewDesign, setStep } = useWorkflowStore();
    const addToast = useToastStore((s) => s.addToast);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [cropTarget, setCropTarget] = useState<DesignFile | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    const handleFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) return;
        if (file.size > MAX_FILE_SIZE) {
            addToast('error', `${file.name} quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa 5MB.`);
            return;
        }
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const data = await uploadFile(formData);
            if ('error' in data) throw new Error(data.error);

            const img = new Image();
            img.onload = () => {
                addSourceDesign({
                    id: uuidv4(),
                    name: file.name,
                    url: data.url,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    file,
                });
            };
            img.src = data.url;
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    }, [addSourceDesign, addToast]);

    const handleFiles = useCallback(async (files: FileList) => {
        for (const file of Array.from(files)) {
            await handleFile(file);
        }
    }, [handleFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
        e.target.value = '';
    }, [handleFiles]);

    const lightboxDesign = lightbox ? sourceDesigns.find((d) => d.id === lightbox) : null;

    return (
        <div className="upload-zone-container">
            {/* Thumbnails grid of uploaded images */}
            {sourceDesigns.length > 0 && (
                <div className="upload-thumbnails-grid">
                    {sourceDesigns.map((design) => (
                        <div key={design.id} className="upload-thumbnail-card">
                            <div
                                className="upload-thumbnail-img zoomable"
                                onClick={() => setLightbox(design.id)}
                            >
                                <img src={design.url} alt={design.name} />
                                <div className="zoom-overlay"><span>🔍</span></div>
                            </div>
                            <div className="upload-thumbnail-info">
                                <span className="upload-thumbnail-name" title={design.name}>{design.name}</span>
                                <span className="upload-thumbnail-size">{design.width}×{design.height}</span>
                            </div>
                            <div className="upload-thumbnail-actions">
                                <RemoveBgButton
                                    imageUrl={design.url}
                                    onResult={(newUrl) => {
                                        // Update in place via remove + add
                                        removeSourceDesign(design.id);
                                        addSourceDesign({ ...design, url: newUrl });
                                    }}
                                />
                                <button className="btn-ghost-sm" onClick={() => setCropTarget(design)}>✂️</button>
                                <button className="btn-ghost-sm btn-danger-sm" onClick={() => removeSourceDesign(design.id)}>✕</button>
                            </div>
                        </div>
                    ))}

                    {/* Add more card — supports click + drag & drop */}
                    <div
                        className={`upload-thumbnail-card upload-add-more ${dragActive ? 'drag-active' : ''}`}
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={handleDrop}
                    >
                        <div className="upload-add-more-content">
                            <span style={{ fontSize: '2rem' }}>{dragActive ? '📥' : '+'}</span>
                            <span>{dragActive ? 'Thả ảnh vào đây' : 'Thêm ảnh'}</span>
                        </div>
                    </div>
                </div>
            )}

            {sourceDesigns.length > 0 && (
                <div className="upload-bottom-bar">
                    <button className="btn-ghost" onClick={startNewDesign}>🔄 Xoá tất cả</button>
                    <span className="upload-count">{sourceDesigns.length} ảnh đã chọn</span>
                    <button className="btn-primary" onClick={() => setStep('variations')}>
                        Tiếp tục →
                    </button>
                </div>
            )}

            {/* Dropzone (shown when no images yet, or as hidden input) */}
            <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleChange} hidden />

            {sourceDesigns.length === 0 && (
                <div
                    className={`upload-dropzone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                >
                    {uploading ? (
                        <div className="upload-loading">
                            <div className="spinner" />
                            <span>Đang tải lên...</span>
                        </div>
                    ) : (
                        <div className="upload-content">
                            <div className="upload-icon" style={{ fontSize: '3rem' }}>📤</div>
                            <h3>Kéo thả hoặc chọn ảnh thiết kế</h3>
                            <p>Hỗ trợ PNG, JPG, WEBP — có thể chọn nhiều ảnh</p>
                            <span className="upload-formats">Tối đa 5MB mỗi ảnh</span>
                        </div>
                    )}
                </div>
            )}

            {/* Also allow drag-drop when images exist */}
            {sourceDesigns.length > 0 && (
                <div
                    className={`upload-dropzone-mini ${dragActive ? 'drag-active' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                >
                    {uploading && <div className="upload-loading"><div className="spinner" /><span>Đang tải...</span></div>}
                </div>
            )}

            {lightboxDesign && (
                <Lightbox imageUrl={lightboxDesign.url} alt={lightboxDesign.name} onClose={() => setLightbox(null)} />
            )}
            {cropTarget && (
                <ImageCropper
                    imageUrl={cropTarget.url}
                    onCrop={async (blob) => {
                        setCropTarget(null);
                        const file = new File([blob], cropTarget.name, { type: 'image/png' });
                        await handleFile(file);
                        removeSourceDesign(cropTarget.id);
                    }}
                    onClose={() => setCropTarget(null)}
                />
            )}
        </div>
    );
}
