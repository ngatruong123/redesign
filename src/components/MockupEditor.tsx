'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { v4 as uuidv4 } from 'uuid';
import Lightbox from './Lightbox';
import type { MockupMask } from '@/types';

const MAX_HISTORY = 20;

export default function MockupEditor() {
    const {
        variations, mockupTemplates, generatedMockups,
        addMockupTemplate, removeMockupTemplate, updateMockupTemplate,
        setGeneratedMockups, setStep, isCompositing, setIsCompositing, setError,
    } = useWorkflowStore();
    const addToast = useToastStore((s) => s.addToast);

    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [selectedMockupIds, setSelectedMockupIds] = useState<Set<string>>(new Set());
    const [lightboxImage, setLightboxImage] = useState<{ url: string; alt: string } | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [zipUrl, setZipUrl] = useState<string | null>(null);
    const [rotation, setRotation] = useState(0);

    // Undo/Redo
    const [maskHistory, setMaskHistory] = useState<(MockupMask | null)[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Drawing state for mask
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);

    const activeTemplate = mockupTemplates.find((t) => t.id === activeTemplateId);
    const selectedVariations = variations.filter((v) => v.selected && v.imageUrl);

    // Sync rotation when switching templates
    useEffect(() => {
        setRotation(activeTemplate?.mask?.rotation || 0);
        // Reset history when switching
        setMaskHistory(activeTemplate?.mask ? [activeTemplate.mask] : []);
        setHistoryIndex(activeTemplate?.mask ? 0 : -1);
    }, [activeTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Push mask to history
    const pushHistory = useCallback((mask: MockupMask | null) => {
        setMaskHistory((prev) => {
            const next = [...prev.slice(0, historyIndex + 1), mask].slice(-MAX_HISTORY);
            return next;
        });
        setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    }, [historyIndex]);

    const undo = useCallback(() => {
        if (historyIndex <= 0 || !activeTemplate) return;
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        const mask = maskHistory[newIdx];
        updateMockupTemplate(activeTemplate.id, { mask });
        setRotation(mask?.rotation || 0);
    }, [historyIndex, maskHistory, activeTemplate, updateMockupTemplate]);

    const redo = useCallback(() => {
        if (historyIndex >= maskHistory.length - 1 || !activeTemplate) return;
        const newIdx = historyIndex + 1;
        setHistoryIndex(newIdx);
        const mask = maskHistory[newIdx];
        updateMockupTemplate(activeTemplate.id, { mask });
        setRotation(mask?.rotation || 0);
    }, [historyIndex, maskHistory, activeTemplate, updateMockupTemplate]);

    // Keyboard shortcuts for undo/redo
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo]);

    // --- File naming ---
    const makeSafeFilename = (templateName: string, variationName: string) =>
        `${templateName}-${variationName}.png`.replace(/[^a-zA-Z0-9._-]/g, '_');

    const triggerDownload = (imageUrl: string, filename: string) => {
        if (!imageUrl) {
            addToast('error', 'Không có URL để tải');
            return;
        }
        // URL format: /api/download/mockups/uuid.png/DesiredName.png
        // Last segment = filename browser saves as
        const filePart = imageUrl.replace(/^\/api\/files\//, '');
        window.location.href = `/api/download/${filePart}/${encodeURIComponent(filename)}`;
    };

    const handleDownloadSelected = () => {
        const toDownload = generatedMockups.filter((m) => selectedMockupIds.has(m.id) && m.imageUrl);
        if (toDownload.length === 0) return;
        // For multiple files, use ZIP download instead of opening many tabs
        if (toDownload.length > 1 && zipUrl) {
            triggerDownload(zipUrl, 'mockups.zip');
        } else {
            toDownload.forEach((mockup) => {
                triggerDownload(mockup.imageUrl, makeSafeFilename(mockup.templateName, mockup.variationName));
            });
        }
    };

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

    // --- Upload mockup template ---
    const handleUploadTemplate = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) return;
        const formData = new FormData();
        formData.append('file', file);
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
            addToast('error', `Upload failed: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    }, [addMockupTemplate, addToast]);

    // --- Canvas drawing for mask ---
    const drawCanvas = useCallback((template: typeof activeTemplate) => {
        if (!template || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);

            if (template.mask) {
                const m = template.mask;
                ctx.save();

                if (m.rotation) {
                    const cx = m.x + m.width / 2;
                    const cy = m.y + m.height / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate((m.rotation * Math.PI) / 180);
                    ctx.translate(-cx, -cy);
                }

                ctx.strokeStyle = 'rgba(0, 230, 138, 0.8)';
                ctx.lineWidth = 3;
                ctx.setLineDash([6, 4]);
                ctx.fillStyle = 'rgba(0, 230, 138, 0.15)';
                ctx.fillRect(m.x, m.y, m.width, m.height);
                ctx.strokeRect(m.x, m.y, m.width, m.height);
                ctx.setLineDash([]);
                ctx.restore();
            }
        };
        img.src = template.imageUrl;
    }, []);

    useEffect(() => {
        drawCanvas(activeTemplate);
    }, [activeTemplate, drawCanvas]);

    // Unified coord helper for mouse and touch
    const getCoords = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }, []);

    const handlePointerDown = (clientX: number, clientY: number) => {
        const coords = getCoords(clientX, clientY);
        setIsDrawing(true);
        setDrawStart(coords);
    };

    const handlePointerMove = (clientX: number, clientY: number) => {
        if (!isDrawing || !drawStart || !canvasRef.current || !activeTemplate) return;
        const coords = getCoords(clientX, clientY);
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
            ctx.drawImage(img, 0, 0);

            const x = Math.min(drawStart.x, coords.x);
            const y = Math.min(drawStart.y, coords.y);
            const w = Math.abs(coords.x - drawStart.x);
            const h = Math.abs(coords.y - drawStart.y);

            ctx.strokeStyle = 'rgba(0, 230, 138, 0.8)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 4]);
            ctx.fillStyle = 'rgba(0, 230, 138, 0.15)';
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        };
        img.src = activeTemplate.imageUrl;
    };

    const handlePointerUp = (clientX: number, clientY: number) => {
        if (!isDrawing || !drawStart || !activeTemplate) return;
        const coords = getCoords(clientX, clientY);
        setIsDrawing(false);

        const x = Math.min(drawStart.x, coords.x);
        const y = Math.min(drawStart.y, coords.y);
        const w = Math.abs(coords.x - drawStart.x);
        const h = Math.abs(coords.y - drawStart.y);

        if (w > 10 && h > 10) {
            const mask = { x, y, width: w, height: h, rotation };
            updateMockupTemplate(activeTemplate.id, { mask });
            pushHistory(mask);
        }

        setDrawStart(null);
    };

    // Mouse handlers
    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerDown(e.clientX, e.clientY);
    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerMove(e.clientX, e.clientY);
    const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerUp(e.clientX, e.clientY);

    // Touch handlers
    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const touch = e.touches[0];
        handlePointerDown(touch.clientX, touch.clientY);
    };
    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const touch = e.touches[0];
        handlePointerMove(touch.clientX, touch.clientY);
    };
    const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        handlePointerUp(touch.clientX, touch.clientY);
    };

    // Rotation change
    const handleRotationChange = (newRotation: number) => {
        setRotation(newRotation);
        if (activeTemplate?.mask) {
            const mask = { ...activeTemplate.mask, rotation: newRotation };
            updateMockupTemplate(activeTemplate.id, { mask });
            pushHistory(mask);
        }
    };

    // --- Generate mockups ---
    const handleGenerateMockups = async () => {
        const templatesWithMask = mockupTemplates.filter((t) => t.mask);
        if (templatesWithMask.length === 0 || selectedVariations.length === 0) return;

        setIsCompositing(true);
        setError(null);

        const items = templatesWithMask.flatMap((t) =>
            selectedVariations.map((v) => ({
                mockupImagePath: t.imageUrl,
                designImagePath: v.imageUrl,
                mask: t.mask,
                templateName: t.name,
                variationName: v.styleName,
            }))
        );

        try {
            const res = await fetch('/api/mockup/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setGeneratedMockups(data.results);
            if (data.zipUrl) setZipUrl(data.zipUrl);
            addToast('success', `Đã tạo ${data.results.length} mockup!`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Mockup generation failed';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsCompositing(false);
        }
    };

    const readyTemplateCount = mockupTemplates.filter((t) => t.mask).length;
    const selectedMockupCount = selectedMockupIds.size;

    return (
        <div className="mockup-container">
            {/* Header */}
            <div className="mockup-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="btn-ghost" onClick={() => setStep('variations')}>← Quay lại</button>
                    <span className="badge">{selectedVariations.length} biến thể đã chọn</span>
                </div>
            </div>

            {/* Layout: sidebar + canvas */}
            <div className="mockup-layout">
                {/* Sidebar */}
                <div className="mockup-sidebar">
                    <h3>Mockup Templates</h3>
                    <div
                        className={`mockup-upload-mini ${dragActive ? 'drag-active' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragActive(false);
                            const file = e.dataTransfer.files[0];
                            if (file) handleUploadTemplate(file);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadTemplate(file);
                        }} hidden />
                        + Thêm mockup template
                    </div>

                    <div className="template-list">
                        {mockupTemplates.map((t) => (
                            <div
                                key={t.id}
                                className={`template-item ${activeTemplateId === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTemplateId(t.id)}
                            >
                                <img src={t.imageUrl} alt={t.name} />
                                <div className="template-item-info">
                                    <span className="template-name">{t.name}</span>
                                    <span className={`template-status ${t.mask ? 'has-mask' : ''}`}>
                                        {t.mask ? '✅ Mask defined' : '⚠️ No mask'}
                                    </span>
                                </div>
                                <button className="btn-icon-sm" onClick={(e) => {
                                    e.stopPropagation();
                                    removeMockupTemplate(t.id);
                                    if (activeTemplateId === t.id) setActiveTemplateId(null);
                                }}>✕</button>
                            </div>
                        ))}
                    </div>

                    {/* Selected variations mini */}
                    <h3>Biến thể đã chọn</h3>
                    <div className="selected-variations-mini">
                        {selectedVariations.map((v) => (
                            <div key={v.id} className="mini-variation">
                                <img src={v.imageUrl} alt={v.styleName} />
                                <span>{v.styleName}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Canvas */}
                <div className="mockup-canvas-area">
                    {activeTemplate ? (
                        <>
                            <p className="canvas-instructions">
                                🎯 Kéo chuột trên ảnh để chọn vùng đặt thiết kế
                            </p>

                            {/* Rotation + Undo/Redo controls */}
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div className="rotation-controls">
                                    <label>🔄 Xoay:</label>
                                    <div className="rotation-btns">
                                        <button className="btn-icon-sm" onClick={() => handleRotationChange(rotation - 15)}>-15°</button>
                                        <button className="btn-icon-sm" onClick={() => handleRotationChange(rotation - 5)}>-5°</button>
                                        <button className="btn-icon-sm" onClick={() => handleRotationChange(0)}>0°</button>
                                        <button className="btn-icon-sm" onClick={() => handleRotationChange(rotation + 5)}>+5°</button>
                                        <button className="btn-icon-sm" onClick={() => handleRotationChange(rotation + 15)}>+15°</button>
                                    </div>
                                    <input
                                        type="range"
                                        min="-180"
                                        max="180"
                                        value={rotation}
                                        onChange={(e) => handleRotationChange(Number(e.target.value))}
                                    />
                                    <span className="rotation-value">{rotation}°</span>
                                </div>

                                <div className="undo-redo-bar">
                                    <button
                                        className="btn-icon"
                                        title="Undo (Ctrl+Z)"
                                        onClick={undo}
                                        disabled={historyIndex <= 0}
                                    >↶</button>
                                    <button
                                        className="btn-icon"
                                        title="Redo (Ctrl+Shift+Z)"
                                        onClick={redo}
                                        disabled={historyIndex >= maskHistory.length - 1}
                                    >↷</button>
                                </div>
                            </div>

                            <div className="canvas-wrapper">
                                <canvas
                                    ref={canvasRef}
                                    onMouseDown={handleCanvasMouseDown}
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp}
                                    onTouchStart={handleTouchStart}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={handleTouchEnd}
                                    style={{ cursor: 'crosshair', touchAction: 'none' }}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="canvas-empty">
                            <h3>Chọn hoặc thêm mockup template</h3>
                            <p>Upload ảnh mockup (áo, cốc, poster...) rồi kéo chọn vùng để đặt thiết kế</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Generate bar */}
            <div className="mockup-generate-bar">
                <button
                    className="btn-primary btn-lg"
                    disabled={readyTemplateCount === 0 || selectedVariations.length === 0 || isCompositing}
                    onClick={handleGenerateMockups}
                >
                    {isCompositing ? <><span className="spinner-sm" /> Đang tạo mockup...</>
                        : `Tạo ${readyTemplateCount * selectedVariations.length} mockup`}
                </button>
            </div>

            {/* Generated mockups */}
            {generatedMockups.length > 0 && (
                <div className="generated-mockups-section">
                    <div className="generated-header">
                        <h3>🖼️ Mockups ({generatedMockups.length})</h3>
                        <div className="generated-header-actions">
                            <button className="btn-ghost-sm" onClick={selectAllMockups}>Chọn tất cả</button>
                            <button className="btn-ghost-sm" onClick={() => setSelectedMockupIds(new Set())}>Bỏ chọn</button>
                            {zipUrl && (
                                <button className="btn-primary" onClick={() => triggerDownload(zipUrl, 'mockups.zip')}>
                                    📦 Tải tất cả (ZIP)
                                </button>
                            )}
                            {selectedMockupCount > 0 && (
                                <button
                                    className="btn-primary"
                                    onClick={handleDownloadSelected}
                                    disabled={downloading}
                                >
                                    {downloading ? <><span className="spinner-sm" /> Đang tải...</>
                                        : `⬇️ Tải ${selectedMockupCount} ảnh`}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="generated-grid">
                        {generatedMockups.map((mockup) => (
                            <div key={mockup.id} className={`generated-card ${selectedMockupIds.has(mockup.id) ? 'selected' : ''}`}>
                                {mockup.imageUrl ? (
                                    <>
                                        <div
                                            className="generated-image-wrap"
                                            onClick={() => setLightboxImage({ url: mockup.imageUrl, alt: `${mockup.templateName} - ${mockup.variationName}` })}
                                        >
                                            <img src={mockup.imageUrl} alt={`${mockup.templateName} - ${mockup.variationName}`} />
                                            <div className="zoom-overlay"><span>🔍</span></div>
                                        </div>
                                        <div className="generated-card-footer">
                                            <div className="generated-card-info">
                                                <span>{mockup.templateName}</span>
                                                <span className="dot">·</span>
                                                <span>{mockup.variationName}</span>
                                            </div>
                                            <div className="generated-card-actions">
                                                <button
                                                    className="btn-icon-sm"
                                                    title="Download"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        triggerDownload(mockup.imageUrl, makeSafeFilename(mockup.templateName, mockup.variationName));
                                                    }}
                                                >
                                                    ⬇️
                                                </button>
                                                <div
                                                    className={`checkbox ${selectedMockupIds.has(mockup.id) ? 'checked' : ''}`}
                                                    onClick={() => toggleMockupSelection(mockup.id)}
                                                >
                                                    {selectedMockupIds.has(mockup.id) && '✓'}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="variation-error">
                                        <span>⚠️</span>
                                        <p>{mockup.error || 'Lỗi'}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {lightboxImage && (
                <Lightbox imageUrl={lightboxImage.url} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
            )}
        </div>
    );
}
