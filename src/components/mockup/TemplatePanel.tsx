'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToastStore } from '@/store/toast-store';
import type { MockupTemplate } from '@/types';

interface TemplatePanelProps {
    mockupTemplates: MockupTemplate[];
    activeTemplateId: string | null;
    addMockupTemplate: (t: MockupTemplate) => void;
    removeMockupTemplate: (id: string) => void;
    updateMockupTemplate: (id: string, updates: Partial<MockupTemplate>) => void;
    setActiveTemplateId: (id: string | null) => void;
}

export default function TemplatePanel({
    mockupTemplates,
    activeTemplateId,
    addMockupTemplate,
    removeMockupTemplate,
    updateMockupTemplate,
    setActiveTemplateId,
}: TemplatePanelProps) {
    const addToast = useToastStore((s) => s.addToast);
    const [dragActive, setDragActive] = useState(false);
    const [uploadingTemplates, setUploadingTemplates] = useState(false);
    const [brokenTemplateIds, setBrokenTemplateIds] = useState<Set<string>>(new Set());
    const [replacingTemplateId, setReplacingTemplateId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const replaceImageInputRef = useRef<HTMLInputElement>(null);

    // Detect broken template images
    useEffect(() => {
        const broken = new Set<string>();
        let remaining = mockupTemplates.length;
        if (remaining === 0) return;

        mockupTemplates.forEach((t) => {
            const img = new Image();
            img.onload = () => {
                remaining--;
                if (remaining === 0) setBrokenTemplateIds(broken);
            };
            img.onerror = () => {
                broken.add(t.id);
                remaining--;
                if (remaining === 0) setBrokenTemplateIds(broken);
            };
            img.src = t.imageUrl;
        });
    }, [mockupTemplates]);

    const handleReplaceTemplateImage = useCallback(async (templateId: string, file: File) => {
        if (!file.type.startsWith('image/')) return;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'template');
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            updateMockupTemplate(templateId, { imageUrl: data.url });
            setBrokenTemplateIds(prev => { const n = new Set(prev); n.delete(templateId); return n; });
            addToast('success', 'Đã cập nhật ảnh template');
        } catch (err) {
            addToast('error', `Tải lên thất bại: ${err instanceof Error ? err.message : 'Lỗi'}`);
        }
    }, [updateMockupTemplate, addToast]);

    const handleUploadTemplate = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) return;
        setUploadingTemplates(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'template');
        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const newTemplate = {
                id: uuidv4(),
                name: file.name.replace(/\.[^.]+$/, ''),
                imageUrl: data.url,
                mask: null,
            };
            addMockupTemplate(newTemplate);
            setActiveTemplateId(newTemplate.id);
        } catch (err) {
            addToast('error', `Tải lên thất bại: ${err instanceof Error ? err.message : 'Lỗi'}`);
        } finally {
            setUploadingTemplates(false);
        }
    }, [addMockupTemplate, addToast, setActiveTemplateId]);

    const handleUploadMultiple = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        setUploadingTemplates(true);

        const uploads = imageFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'template');
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return {
                id: uuidv4(),
                name: file.name.replace(/\.[^.]+$/, ''),
                imageUrl: data.url,
                mask: null,
            };
        });

        const results = await Promise.allSettled(uploads);
        let added = 0;
        let lastId: string | null = null;
        for (const r of results) {
            if (r.status === 'fulfilled') {
                addMockupTemplate(r.value);
                lastId = r.value.id;
                added++;
            }
        }
        if (lastId) setActiveTemplateId(lastId);
        const failed = results.filter(r => r.status === 'rejected').length;
        if (added > 0) addToast('success', `Đã thêm ${added} template`);
        if (failed > 0) addToast('error', `${failed} file upload thất bại`);
        setUploadingTemplates(false);
    }, [addMockupTemplate, addToast, setActiveTemplateId]);

    return (
        <>
            <h3>Mẫu Mockup</h3>
            <div
                className={`mockup-upload-mini ${dragActive ? 'drag-active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                    e.preventDefault(); setDragActive(false);
                    if (e.dataTransfer.files.length > 1) {
                        handleUploadMultiple(e.dataTransfer.files);
                    } else {
                        const file = e.dataTransfer.files[0];
                        if (file) handleUploadTemplate(file);
                    }
                }}
                onClick={() => fileInputRef.current?.click()}
            >
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => {
                    const files = e.target.files;
                    if (!files) return;
                    if (files.length > 1) {
                        handleUploadMultiple(files);
                    } else if (files[0]) {
                        handleUploadTemplate(files[0]);
                    }
                    e.target.value = '';
                }} hidden />
                {uploadingTemplates ? <><span className="spinner-sm" /> Đang tải lên...</> : '+ Thêm mẫu mockup (chọn nhiều)'}
            </div>
            <input ref={replaceImageInputRef} type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && replacingTemplateId) handleReplaceTemplateImage(replacingTemplateId, file);
                e.target.value = '';
                setReplacingTemplateId(null);
            }} hidden />

            <div className="template-list">
                {mockupTemplates.map((t) => (
                    <div
                        key={t.id}
                        className={`template-item ${activeTemplateId === t.id ? 'active' : ''}`}
                        onClick={() => setActiveTemplateId(t.id)}
                    >
                        {brokenTemplateIds.has(t.id) ? (
                            <div style={{ width: 48, height: 48, background: 'var(--bg-tertiary, #333)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                                ?
                            </div>
                        ) : (
                            <img src={t.imageUrl} alt={t.name} />
                        )}
                        <div className="template-item-info">
                            <span className="template-name">{t.name}</span>
                            {brokenTemplateIds.has(t.id) ? (
                                <button
                                    className="btn-ghost-sm"
                                    style={{ fontSize: 10, color: 'var(--warning, #f59e0b)', padding: '2px 6px' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setReplacingTemplateId(t.id);
                                        replaceImageInputRef.current?.click();
                                    }}
                                >
                                    Upload lại ảnh
                                </button>
                            ) : (
                                <span className={`template-status ${t.mask ? 'has-mask' : ''}`}>
                                    {t.mask ? 'Đã có mask' : 'Chưa vẽ mask'}
                                </span>
                            )}
                        </div>
                        <button className="btn-icon-sm" onClick={(e) => {
                            e.stopPropagation();
                            removeMockupTemplate(t.id);
                            if (activeTemplateId === t.id) setActiveTemplateId(null);
                        }}>✕</button>
                    </div>
                ))}
            </div>
        </>
    );
}
