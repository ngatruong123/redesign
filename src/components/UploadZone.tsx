'use client';

import { useState, useRef, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { v4 as uuidv4 } from 'uuid';
import RemoveBgButton from './RemoveBgButton';
import Lightbox from './Lightbox';
import ImageCropper from './ImageCropper';

export default function UploadZone() {
    const { sourceDesign, setSourceDesign, setStep } = useWorkflowStore();
    const addToast = useToastStore((s) => s.addToast);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [lightbox, setLightbox] = useState(false);
    const [showCropper, setShowCropper] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) return;
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const img = new Image();
            img.onload = () => {
                setSourceDesign({
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
    }, [setSourceDesign]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    if (sourceDesign) {
        return (
            <div className="upload-zone-container">
                <div className="upload-preview">
                    <div
                        className="preview-image-wrap zoomable"
                        onClick={() => setLightbox(true)}
                    >
                        <img src={sourceDesign.url} alt={sourceDesign.name} />
                        <div className="zoom-overlay"><span>🔍</span></div>
                    </div>
                    <div className="preview-info">
                        <h4>{sourceDesign.name}</h4>
                        <p>{sourceDesign.width} × {sourceDesign.height}px</p>
                        <div className="preview-actions">
                            <RemoveBgButton
                                imageUrl={sourceDesign.url}
                                onResult={(newUrl) => setSourceDesign({ ...sourceDesign, url: newUrl })}
                            />
                            <button className="btn-ghost" onClick={() => setShowCropper(true)}>
                                ✂️ Cắt/Chỉnh
                            </button>
                            <button className="btn-ghost" onClick={() => setSourceDesign(null)}>
                                🔄 Đổi ảnh
                            </button>
                            <button className="btn-primary" onClick={() => setStep('variations')}>
                                Tiếp tục →
                            </button>
                        </div>
                    </div>
                </div>
                {lightbox && (
                    <Lightbox imageUrl={sourceDesign.url} alt={sourceDesign.name} onClose={() => setLightbox(false)} />
                )}
                {showCropper && (
                    <ImageCropper
                        imageUrl={sourceDesign.url}
                        onCrop={async (blob) => {
                            setShowCropper(false);
                            const file = new File([blob], sourceDesign.name, { type: 'image/png' });
                            await handleFile(file);
                        }}
                        onClose={() => setShowCropper(false)}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="upload-zone-container">
            <div
                className={`upload-dropzone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} hidden />
                {uploading ? (
                    <div className="upload-loading">
                        <div className="spinner" />
                        <span>Đang tải lên...</span>
                    </div>
                ) : (
                    <div className="upload-content">
                        <div className="upload-icon" style={{ fontSize: '3rem' }}>📤</div>
                        <h3>Kéo thả hoặc chọn ảnh thiết kế</h3>
                        <p>Hỗ trợ PNG, JPG, WEBP</p>
                        <span className="upload-formats">Tối đa 10MB</span>
                    </div>
                )}
            </div>
        </div>
    );
}
