'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface RemoveBgPanelProps {
    imageUrl: string;
    onResult: (newUrl: string) => void;
    onClose: () => void;
}

export default function RemoveBgPanel({ imageUrl, onResult, onClose }: RemoveBgPanelProps) {
    const [keyColor, setKeyColor] = useState<string | null>(null);
    const [tolerance, setTolerance] = useState(30);
    const [softEdge, setSoftEdge] = useState(15);
    const [edgeSmooth, setEdgeSmooth] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [canvasReady, setCanvasReady] = useState(false);
    const [cursorColor, setCursorColor] = useState<string | null>(null);

    // Draw source image on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            // Scale to fit max 500px while keeping aspect ratio
            const maxDim = 500;
            const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            setCanvasReady(true);
        };
        img.src = imageUrl;
    }, [imageUrl]);

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

    // Apply color key removal
    const handleApply = useCallback(async () => {
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

    const handleConfirm = () => {
        if (resultUrl) {
            onResult(resultUrl);
            onClose();
        }
    };

    return (
        <div className="removebg-panel-overlay" onClick={onClose}>
            <div className="removebg-panel removebg-panel-colorkey" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="removebg-panel-header">
                    <h2>✂️ Xoá nền theo màu</h2>
                    <button className="btn-icon" onClick={onClose} title="Đóng">✕</button>
                </div>

                {/* Main content: 2-column layout */}
                <div className="colorkey-layout">
                    {/* Left: Eyedropper canvas */}
                    <div className="colorkey-canvas-section">
                        <div className="colorkey-canvas-header">
                            <span className="colorkey-instruction">
                                {keyColor ? 'Click để đổi màu cần xoá' : 'Click vào vùng nền cần xoá'}
                            </span>
                            {/* Live cursor color indicator */}
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

                    {/* Right: Controls + Preview */}
                    <div className="colorkey-controls-section">
                        {/* Selected color */}
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
                                    <span>← Click vào ảnh để chọn màu</span>
                                </div>
                            )}
                        </div>

                        {/* Tolerance slider */}
                        <div className="colorkey-slider-group">
                            <div className="colorkey-slider-header">
                                <label>Tolerance</label>
                                <span className="colorkey-slider-value">{tolerance}</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={tolerance}
                                onChange={(e) => { setTolerance(Number(e.target.value)); setResultUrl(null); }}
                                className="colorkey-range"
                            />
                            <div className="colorkey-slider-labels">
                                <span>Chính xác</span>
                                <span>Rộng</span>
                            </div>
                        </div>

                        {/* Soft edge slider */}
                        <div className="colorkey-slider-group">
                            <div className="colorkey-slider-header">
                                <label>Soft Edge</label>
                                <span className="colorkey-slider-value">{softEdge}</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={50}
                                value={softEdge}
                                onChange={(e) => { setSoftEdge(Number(e.target.value)); setResultUrl(null); }}
                                className="colorkey-range"
                            />
                            <div className="colorkey-slider-labels">
                                <span>Sắc nét</span>
                                <span>Mềm mại</span>
                            </div>
                        </div>

                        {/* Edge smooth toggle */}
                        <label className="colorkey-toggle">
                            <input
                                type="checkbox"
                                checked={edgeSmooth}
                                onChange={(e) => { setEdgeSmooth(e.target.checked); setResultUrl(null); }}
                            />
                            <span>Làm mịn viền (blur nhẹ)</span>
                        </label>

                        {/* Result preview */}
                        {resultUrl && (
                            <div className="colorkey-result-preview">
                                <label>Kết quả</label>
                                <div className="colorkey-result-img">
                                    <img src={resultUrl} alt="Result" />
                                </div>
                            </div>
                        )}

                        {errorMsg && (
                            <div className="colorkey-error">⚠️ {errorMsg}</div>
                        )}
                    </div>
                </div>

                {/* Action buttons */}
                <div className="removebg-actions">
                    <button className="btn-ghost" onClick={onClose}>Huỷ</button>
                    <div className="removebg-result-actions">
                        <button
                            className="btn-primary btn-lg"
                            onClick={resultUrl ? handleConfirm : handleApply}
                            disabled={!keyColor || processing || (!canvasReady)}
                        >
                            {processing ? (
                                <><span className="spinner-sm" /> Đang xử lý...</>
                            ) : resultUrl ? (
                                '✅ Áp dụng'
                            ) : (
                                '✂️ Xoá nền'
                            )}
                        </button>
                        {resultUrl && (
                            <button
                                className="btn-secondary"
                                onClick={handleApply}
                                disabled={processing}
                            >
                                🔄 Thử lại
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
