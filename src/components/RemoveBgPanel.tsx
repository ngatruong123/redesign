'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

type RemoveBgMode = 'ai' | 'colorkey';

interface RemoveBgPanelProps {
    imageUrl: string;
    onResult: (newUrl: string) => void;
    onClose: () => void;
}

export default function RemoveBgPanel({ imageUrl, onResult, onClose }: RemoveBgPanelProps) {
    const [activeMode, setActiveMode] = useState<RemoveBgMode>('ai');
    const [keyColor, setKeyColor] = useState<string | null>(null);
    const [tolerance, setTolerance] = useState(30);
    const [softEdge, setSoftEdge] = useState(15);
    const [edgeSmooth, setEdgeSmooth] = useState(false);
    const [protectSubject, setProtectSubject] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [canvasReady, setCanvasReady] = useState(false);
    const [cursorColor, setCursorColor] = useState<string | null>(null);

    // Draw source image on canvas (re-run when switching to colorkey mode)
    useEffect(() => {
        if (activeMode !== 'colorkey') return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            const maxDim = 500;
            const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            setCanvasReady(true);
        };
        img.onerror = () => {
            // Retry without crossOrigin for same-origin images
            const retry = new Image();
            retry.onload = () => {
                imgRef.current = retry;
                const maxDim = 500;
                const scale = Math.min(maxDim / retry.width, maxDim / retry.height, 1);
                canvas.width = Math.round(retry.width * scale);
                canvas.height = Math.round(retry.height * scale);
                ctx.drawImage(retry, 0, 0, canvas.width, canvas.height);
                setCanvasReady(true);
            };
            retry.src = imageUrl;
        };
        img.src = imageUrl;
    }, [imageUrl, activeMode]);

    // Get pixel color at canvas position
    const getPixelColor = useCallback((clientX: number, clientY: number): string | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const rect = canvas.getBoundingClientRect();
        const x = Math.round((clientX - rect.left) * (canvas.width / rect.width));
        const y = Math.round((clientY - rect.top) * (canvas.height / rect.height));
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        return '#' + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, '0')).join('');
    }, []);

    const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const color = getPixelColor(e.clientX, e.clientY);
        if (color) {
            setKeyColor(color);
            setResultUrl(null);
        }
    }, [getPixelColor]);

    const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const color = getPixelColor(e.clientX, e.clientY);
        setCursorColor(color);
    }, [getPixelColor]);

    const handleCanvasLeave = useCallback(() => {
        setCursorColor(null);
    }, []);

    // Apply AI background removal
    const handleApplyAI = useCallback(async () => {
        setProcessing(true);
        setResultUrl(null);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/remove-bg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl,
                    mode: 'transparent',
                    edgeSmooth,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResultUrl(data.url);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Lỗi xử lý');
        } finally {
            setProcessing(false);
        }
    }, [imageUrl, edgeSmooth]);

    // Apply color key removal
    const handleApplyColorkey = useCallback(async () => {
        if (!keyColor) return;
        setProcessing(true);
        setResultUrl(null);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/remove-bg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl,
                    mode: 'colorkey',
                    keyColor,
                    tolerance,
                    softEdge,
                    edgeSmooth,
                    protectSubject,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResultUrl(data.url);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Lỗi xử lý');
        } finally {
            setProcessing(false);
        }
    }, [imageUrl, keyColor, tolerance, softEdge, edgeSmooth]);

    const handleApply = activeMode === 'ai' ? handleApplyAI : handleApplyColorkey;

    const handleConfirm = () => {
        if (resultUrl) {
            onResult(resultUrl);
            onClose();
        }
    };

    const canApply = activeMode === 'ai' || !!keyColor;

    return (
        <div className="removebg-panel-overlay" onClick={onClose}>
            <div className="removebg-panel removebg-panel-colorkey" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="removebg-panel-header">
                    <h2>Xoá nền ảnh</h2>
                    <button className="btn-icon" onClick={onClose} title="Đóng">✕</button>
                </div>

                {/* Mode tabs */}
                <div className="removebg-tabs">
                    <button
                        className={`removebg-tab ${activeMode === 'ai' ? 'active' : ''}`}
                        onClick={() => { setActiveMode('ai'); setResultUrl(null); setErrorMsg(null); }}
                    >
                        AI tự động
                    </button>
                    <button
                        className={`removebg-tab ${activeMode === 'colorkey' ? 'active' : ''}`}
                        onClick={() => { setActiveMode('colorkey'); setResultUrl(null); setErrorMsg(null); }}
                    >
                        Theo màu
                    </button>
                </div>

                {activeMode === 'ai' ? (
                    /* AI Mode */
                    <div className="removebg-ai-layout">
                        <div className="removebg-ai-preview">
                            <div className="removebg-ai-before">
                                <label>Ảnh gốc</label>
                                <img src={imageUrl} alt="Original" />
                            </div>
                            <div className="removebg-ai-arrow">→</div>
                            <div className="removebg-ai-after">
                                <label>Kết quả</label>
                                {resultUrl ? (
                                    <div className="removebg-ai-result-img checkerboard-bg">
                                        <img src={resultUrl} alt="Result" />
                                    </div>
                                ) : (
                                    <div className="removebg-ai-placeholder checkerboard-bg">
                                        {processing ? (
                                            <><span className="spinner-sm" /> Đang xử lý...</>
                                        ) : (
                                            <span>Bấm &quot;Xoá nền&quot; để bắt đầu</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <label className="colorkey-toggle">
                            <input
                                type="checkbox"
                                checked={edgeSmooth}
                                onChange={(e) => { setEdgeSmooth(e.target.checked); setResultUrl(null); }}
                            />
                            <span>Làm mịn viền</span>
                        </label>

                        {errorMsg && (
                            <div className="colorkey-error">{errorMsg}</div>
                        )}
                    </div>
                ) : (
                    /* Colorkey Mode */
                    <div className="colorkey-layout">
                        <div className="colorkey-canvas-section">
                            <div className="colorkey-canvas-header">
                                <span className="colorkey-instruction">
                                    {keyColor ? 'Click để đổi màu cần xoá' : 'Click vào vùng nền cần xoá'}
                                </span>
                                {cursorColor && (
                                    <span className="colorkey-cursor-badge">
                                        <span className="colorkey-cursor-dot" style={{ background: cursorColor }} />
                                        <span className="colorkey-cursor-hex">{cursorColor}</span>
                                    </span>
                                )}
                            </div>
                            <canvas
                                ref={canvasRef}
                                className="colorkey-canvas"
                                onClick={handleCanvasClick}
                                onMouseMove={handleCanvasMove}
                                onMouseLeave={handleCanvasLeave}
                            />
                        </div>

                        <div className="colorkey-controls-section">
                            <div className="colorkey-selected">
                                <label>Màu đã chọn</label>
                                {keyColor ? (
                                    <div className="colorkey-color-display">
                                        <div className="colorkey-color-swatch" style={{ background: keyColor }} />
                                        <input
                                            type="color"
                                            value={keyColor}
                                            onChange={(e) => { setKeyColor(e.target.value); setResultUrl(null); }}
                                            className="colorkey-color-input"
                                        />
                                        <input
                                            type="text"
                                            value={keyColor}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (/^#[0-9a-fA-F]{6}$/.test(v)) { setKeyColor(v); setResultUrl(null); }
                                            }}
                                            className="colorkey-hex-input"
                                            spellCheck={false}
                                        />
                                    </div>
                                ) : (
                                    <div className="colorkey-no-color">
                                        <span>Click vào ảnh để chọn màu</span>
                                    </div>
                                )}
                            </div>

                            <div className="colorkey-slider-group">
                                <div className="colorkey-slider-header">
                                    <label>Tolerance</label>
                                    <span className="colorkey-slider-value">{tolerance}</span>
                                </div>
                                <input type="range" min={0} max={100} value={tolerance}
                                    onChange={(e) => { setTolerance(Number(e.target.value)); setResultUrl(null); }}
                                    className="colorkey-range" />
                                <div className="colorkey-slider-labels">
                                    <span>Chính xác</span><span>Rộng</span>
                                </div>
                            </div>

                            <div className="colorkey-slider-group">
                                <div className="colorkey-slider-header">
                                    <label>Soft Edge</label>
                                    <span className="colorkey-slider-value">{softEdge}</span>
                                </div>
                                <input type="range" min={0} max={50} value={softEdge}
                                    onChange={(e) => { setSoftEdge(Number(e.target.value)); setResultUrl(null); }}
                                    className="colorkey-range" />
                                <div className="colorkey-slider-labels">
                                    <span>Sắc nét</span><span>Mềm mại</span>
                                </div>
                            </div>

                            <label className="colorkey-toggle">
                                <input type="checkbox" checked={edgeSmooth}
                                    onChange={(e) => { setEdgeSmooth(e.target.checked); setResultUrl(null); }} />
                                <span>Làm mịn viền</span>
                            </label>

                            <label className="colorkey-toggle">
                                <input type="checkbox" checked={protectSubject}
                                    onChange={(e) => { setProtectSubject(e.target.checked); setResultUrl(null); }} />
                                <span>Bảo vệ sản phẩm (AI)</span>
                            </label>

                            {resultUrl && (
                                <div className="colorkey-result-preview">
                                    <label>Kết quả</label>
                                    <div className="colorkey-result-img checkerboard-bg">
                                        <img src={resultUrl} alt="Result" />
                                    </div>
                                </div>
                            )}

                            {errorMsg && (
                                <div className="colorkey-error">{errorMsg}</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="removebg-actions">
                    <button className="btn-ghost" onClick={onClose}>Huỷ</button>
                    <div className="removebg-result-actions">
                        <button
                            className="btn-primary btn-lg"
                            onClick={resultUrl ? handleConfirm : handleApply}
                            disabled={!canApply || processing}
                        >
                            {processing ? (
                                <><span className="spinner-sm" /> Đang xử lý...</>
                            ) : resultUrl ? (
                                'Áp dụng'
                            ) : (
                                'Xoá nền'
                            )}
                        </button>
                        {resultUrl && (
                            <button className="btn-secondary" onClick={handleApply} disabled={processing}>
                                Thử lại
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
