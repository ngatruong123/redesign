'use client';

import { useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import type { GeneratedMockup } from '@/types';

interface Props {
    mockup: GeneratedMockup;
    onClose: () => void;
}

export default function SEOPanel({ mockup, onClose }: Props) {
    const updateMockupSEO = useWorkflowStore((s) => s.updateMockupSEO);
    const addToast = useToastStore((s) => s.addToast);

    const [productContext, setProductContext] = useState('');
    const [title, setTitle] = useState(mockup.seo?.title || '');
    const [description, setDescription] = useState(mockup.seo?.description || '');
    const [tags, setTags] = useState<string[]>(mockup.seo?.tags || []);
    const [newTag, setNewTag] = useState('');
    const [isGenerating, setIsGenerating] = useState(mockup.seo?.status === 'generating');
    const [error, setError] = useState<string | null>(mockup.seo?.error || null);

    const handleGenerate = useCallback(async () => {
        setIsGenerating(true);
        setError(null);
        updateMockupSEO(mockup.id, { status: 'generating' });
        try {
            const res = await fetch('/api/generate-seo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: mockup.imageUrl, productContext: productContext.trim() || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate SEO');
            setTitle(data.title);
            setDescription(data.description);
            setTags(data.tags);
            updateMockupSEO(mockup.id, { title: data.title, description: data.description, tags: data.tags, status: 'done', error: undefined });
            addToast('success', 'SEO content generated!');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Generation failed';
            setError(msg);
            updateMockupSEO(mockup.id, { status: 'error', error: msg });
            addToast('error', msg);
        } finally {
            setIsGenerating(false);
        }
    }, [mockup.id, mockup.imageUrl, productContext, updateMockupSEO, addToast]);

    const copyToClipboard = useCallback(async (text: string) => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }, []);

    const handleCopyAll = useCallback(() => {
        copyToClipboard(`${title}\n\n${description}\n\nTags: ${tags.join(', ')}`);
        addToast('success', 'Đã copy tất cả!');
    }, [title, description, tags, addToast, copyToClipboard]);

    const handleCopy = useCallback((text: string, label: string) => {
        copyToClipboard(text);
        addToast('success', `Đã copy ${label}!`);
    }, [addToast, copyToClipboard]);

    const handleRemoveTag = (index: number) => {
        const next = tags.filter((_, i) => i !== index);
        setTags(next);
        updateMockupSEO(mockup.id, { tags: next });
    };

    const handleAddTag = () => {
        const tag = newTag.trim().slice(0, 20);
        if (!tag || tags.length >= 13) return;
        const next = [...tags, tag];
        setTags(next);
        setNewTag('');
        updateMockupSEO(mockup.id, { tags: next });
    };

    const handleTitleChange = (val: string) => {
        const v = val.slice(0, 140);
        setTitle(v);
        updateMockupSEO(mockup.id, { title: v });
    };

    const handleDescriptionChange = (val: string) => {
        const v = val.slice(0, 10000);
        setDescription(v);
        updateMockupSEO(mockup.id, { description: v });
    };

    const hasSEO = title || description || tags.length > 0;

    return (
        <div className="seo-overlay" onClick={onClose}>
            <div className="seo-modal" onClick={(e) => e.stopPropagation()}>
                <div className="seo-header">
                    <h2>Etsy SEO Generator</h2>
                    <button className="seo-close-btn" onClick={onClose}>×</button>
                </div>

                <div className="seo-preview-row">
                    <div className="seo-preview-thumb">
                        <img src={mockup.imageUrl} alt={`${mockup.templateName} - ${mockup.variationName}`} />
                    </div>
                    <div className="seo-context-col">
                        <div className="seo-context-label">{mockup.templateName} · {mockup.variationName}</div>
                        <label className="seo-label">Thông tin bổ sung (tuỳ chọn):</label>
                        <textarea
                            className="seo-textarea"
                            value={productContext}
                            onChange={(e) => setProductContext(e.target.value)}
                            placeholder="Ví dụ: T-shirt cotton premium, có size S-3XL, in DTG chất lượng cao..."
                            disabled={isGenerating}
                            rows={3}
                        />
                    </div>
                </div>

                <button className="btn-primary seo-generate-btn" disabled={isGenerating} onClick={handleGenerate}>
                    {isGenerating ? <><span className="spinner-sm" /> Đang phân tích ảnh và sinh SEO...</>
                        : hasSEO ? 'Sinh lại SEO' : 'Sinh SEO Title & Description'}
                </button>

                {error && <div className="seo-error">{error}</div>}

                {hasSEO && (
                    <div>
                        <div className="seo-field">
                            <div className="seo-field-header">
                                <label className="seo-field-label">Title</label>
                                <div className="seo-field-actions">
                                    <span className={`seo-char-count ${title.length > 130 ? 'seo-char-count--over' : ''}`}>{title.length}/140</span>
                                    <button className="btn-ghost-sm seo-copy-btn" onClick={() => handleCopy(title, 'Title')}>Copy</button>
                                </div>
                            </div>
                            <input className="seo-input seo-input--title" type="text" value={title} onChange={(e) => handleTitleChange(e.target.value)} />
                        </div>

                        <div className="seo-field">
                            <div className="seo-field-header">
                                <label className="seo-field-label">Description</label>
                                <div className="seo-field-actions">
                                    <span className="seo-char-count">{description.length}/10000</span>
                                    <button className="btn-ghost-sm seo-copy-btn" onClick={() => handleCopy(description, 'Description')}>Copy</button>
                                </div>
                            </div>
                            <textarea className="seo-textarea seo-textarea--desc" value={description} onChange={(e) => handleDescriptionChange(e.target.value)} rows={10} />
                        </div>

                        <div className="seo-field seo-field--tags">
                            <div className="seo-field-header">
                                <label className="seo-field-label">Tags</label>
                                <div className="seo-field-actions">
                                    <span className={`seo-char-count ${tags.length > 13 ? 'seo-char-count--over' : ''}`}>{tags.length}/13</span>
                                    <button className="btn-ghost-sm seo-copy-btn" onClick={() => handleCopy(tags.join(', '), 'Tags')}>Copy</button>
                                </div>
                            </div>
                            <div className="seo-tags-list">
                                {tags.map((tag, i) => (
                                    <span key={i} className="seo-tag">
                                        {tag}
                                        <button className="seo-tag-remove" onClick={() => handleRemoveTag(i)}>×</button>
                                    </span>
                                ))}
                            </div>
                            {tags.length < 13 && (
                                <div className="seo-tag-input-row">
                                    <input
                                        className="seo-tag-input"
                                        type="text" value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                                        placeholder="Thêm tag..." maxLength={20}
                                    />
                                    <button className="btn-ghost-sm seo-tag-add-btn" onClick={handleAddTag} disabled={!newTag.trim() || tags.length >= 13}>+</button>
                                </div>
                            )}
                        </div>

                        <button className="btn-primary seo-copy-all-btn" onClick={handleCopyAll}>Copy All (Title + Description + Tags)</button>
                    </div>
                )}
            </div>
        </div>
    );
}
