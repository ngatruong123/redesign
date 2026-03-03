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
                body: JSON.stringify({
                    imageUrl: mockup.imageUrl,
                    productContext: productContext.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate SEO');

            setTitle(data.title);
            setDescription(data.description);
            setTags(data.tags);
            updateMockupSEO(mockup.id, {
                title: data.title,
                description: data.description,
                tags: data.tags,
                status: 'done',
                error: undefined,
            });
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
        const text = `${title}\n\n${description}\n\nTags: ${tags.join(', ')}`;
        copyToClipboard(text);
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
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
        }} onClick={onClose}>
            <div
                style={{
                    background: 'var(--surface-1, #0d0d1a)',
                    border: '1px solid var(--border, #333)',
                    borderRadius: 16,
                    width: '100%', maxWidth: 720, maxHeight: '90vh',
                    overflow: 'auto',
                    padding: 24,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                        📝 Etsy SEO Generator
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', color: 'inherit',
                            fontSize: 24, cursor: 'pointer', opacity: 0.6, lineHeight: 1,
                        }}
                    >×</button>
                </div>

                {/* Mockup preview + context */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                    <div style={{
                        width: 160, height: 160, borderRadius: 12, overflow: 'hidden',
                        border: '1px solid var(--border, #333)', flexShrink: 0,
                    }}>
                        <img
                            src={mockup.imageUrl}
                            alt={`${mockup.templateName} - ${mockup.variationName}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 4 }}>
                            {mockup.templateName} · {mockup.variationName}
                        </div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, opacity: 0.8 }}>
                            Thông tin bổ sung (tuỳ chọn):
                        </label>
                        <textarea
                            value={productContext}
                            onChange={(e) => setProductContext(e.target.value)}
                            placeholder="Ví dụ: T-shirt cotton premium, có size S-3XL, in DTG chất lượng cao..."
                            disabled={isGenerating}
                            rows={3}
                            style={{
                                width: '100%', padding: 10, borderRadius: 8, fontSize: 13,
                                background: 'var(--surface-2, #1a1a2e)', color: 'inherit',
                                border: '1px solid var(--border, #333)', resize: 'vertical',
                            }}
                        />
                    </div>
                </div>

                {/* Generate button */}
                <button
                    className="btn-primary"
                    disabled={isGenerating}
                    onClick={handleGenerate}
                    style={{ width: '100%', marginBottom: 20, padding: '12px 0', fontSize: 15 }}
                >
                    {isGenerating ? (
                        <><span className="spinner-sm" /> Đang phân tích ảnh và sinh SEO...</>
                    ) : hasSEO ? (
                        '🔄 Sinh lại SEO'
                    ) : (
                        '✨ Sinh SEO Title & Description'
                    )}
                </button>

                {/* Error */}
                {error && (
                    <div style={{
                        padding: 12, borderRadius: 8, marginBottom: 16,
                        background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)',
                        color: '#ff6b6b', fontSize: 13,
                    }}>
                        {error}
                    </div>
                )}

                {/* Results */}
                {hasSEO && (
                    <div>
                        {/* Title */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
                            }}>
                                <label style={{ fontSize: 13, fontWeight: 600 }}>Title</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        fontSize: 11, opacity: 0.5,
                                        color: title.length > 130 ? '#ff6b6b' : 'inherit',
                                    }}>
                                        {title.length}/140
                                    </span>
                                    <button
                                        className="btn-ghost-sm"
                                        onClick={() => handleCopy(title, 'Title')}
                                        style={{ fontSize: 11, padding: '2px 8px' }}
                                    >Copy</button>
                                </div>
                            </div>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => handleTitleChange(e.target.value)}
                                style={{
                                    width: '100%', padding: 10, borderRadius: 8, fontSize: 14,
                                    background: 'var(--surface-2, #1a1a2e)', color: 'inherit',
                                    border: '1px solid var(--border, #333)',
                                }}
                            />
                        </div>

                        {/* Description */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
                            }}>
                                <label style={{ fontSize: 13, fontWeight: 600 }}>Description</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 11, opacity: 0.5 }}>
                                        {description.length}/10000
                                    </span>
                                    <button
                                        className="btn-ghost-sm"
                                        onClick={() => handleCopy(description, 'Description')}
                                        style={{ fontSize: 11, padding: '2px 8px' }}
                                    >Copy</button>
                                </div>
                            </div>
                            <textarea
                                value={description}
                                onChange={(e) => handleDescriptionChange(e.target.value)}
                                rows={10}
                                style={{
                                    width: '100%', padding: 10, borderRadius: 8, fontSize: 13,
                                    background: 'var(--surface-2, #1a1a2e)', color: 'inherit',
                                    border: '1px solid var(--border, #333)', resize: 'vertical',
                                    lineHeight: 1.6,
                                }}
                            />
                        </div>

                        {/* Tags */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
                            }}>
                                <label style={{ fontSize: 13, fontWeight: 600 }}>Tags</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        fontSize: 11, opacity: 0.5,
                                        color: tags.length > 13 ? '#ff6b6b' : 'inherit',
                                    }}>
                                        {tags.length}/13
                                    </span>
                                    <button
                                        className="btn-ghost-sm"
                                        onClick={() => handleCopy(tags.join(', '), 'Tags')}
                                        style={{ fontSize: 11, padding: '2px 8px' }}
                                    >Copy</button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {tags.map((tag, i) => (
                                    <span key={i} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '4px 10px', borderRadius: 20, fontSize: 12,
                                        background: 'rgba(124, 58, 237, 0.15)',
                                        border: '1px solid rgba(124, 58, 237, 0.3)',
                                        color: 'var(--accent, #a78bfa)',
                                    }}>
                                        {tag}
                                        <button
                                            onClick={() => handleRemoveTag(i)}
                                            style={{
                                                background: 'none', border: 'none', color: 'inherit',
                                                fontSize: 14, cursor: 'pointer', opacity: 0.6, padding: 0,
                                                lineHeight: 1,
                                            }}
                                        >×</button>
                                    </span>
                                ))}
                            </div>
                            {tags.length < 13 && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                                        placeholder="Thêm tag..."
                                        maxLength={20}
                                        style={{
                                            flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 12,
                                            background: 'var(--surface-2, #1a1a2e)', color: 'inherit',
                                            border: '1px solid var(--border, #333)',
                                        }}
                                    />
                                    <button
                                        className="btn-ghost-sm"
                                        onClick={handleAddTag}
                                        disabled={!newTag.trim() || tags.length >= 13}
                                        style={{ fontSize: 12, padding: '6px 12px' }}
                                    >+</button>
                                </div>
                            )}
                        </div>

                        {/* Copy All */}
                        <button
                            className="btn-primary"
                            onClick={handleCopyAll}
                            style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
                        >
                            📋 Copy All (Title + Description + Tags)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
