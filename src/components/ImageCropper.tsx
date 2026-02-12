'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ImageCropperProps {
    imageUrl: string;
    onCrop: (blob: Blob) => void;
    onClose: () => void;
}

export default function ImageCropper({ imageUrl, onCrop, onClose }: ImageCropperProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [imgLoaded, setImgLoaded] = useState(false);

    // Load image
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            // Default crop: center 80%
            const margin = 0.1;
            setCrop({
                x: Math.round(img.naturalWidth * margin),
                y: Math.round(img.naturalHeight * margin),
                w: Math.round(img.naturalWidth * (1 - 2 * margin)),
                h: Math.round(img.naturalHeight * (1 - 2 * margin)),
            });
            setImgLoaded(true);
        };
        img.src = imageUrl;
    }, [imageUrl]);

    // Draw
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;

        // Scale canvas to fit screen
        const maxW = Math.min(800, window.innerWidth - 100);
        const scale = maxW / img.naturalWidth;
        canvas.width = img.naturalWidth * scale;
        canvas.height = img.naturalHeight * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Darken outside crop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Clear crop area
        const sx = crop.x * scale;
        const sy = crop.y * scale;
        const sw = crop.w * scale;
        const sh = crop.h * scale;

        ctx.clearRect(sx, sy, sw, sh);
        ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, sx, sy, sw, sh);

        // Crop border
        ctx.strokeStyle = 'rgba(0, 230, 138, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
    }, [crop]);

    useEffect(() => {
        if (imgLoaded) draw();
    }, [imgLoaded, draw]);

    const getCoords = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / img.naturalWidth;
        return {
            x: (e.clientX - rect.left) / scale,
            y: (e.clientY - rect.top) / scale,
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const coords = getCoords(e);
        setDragging(true);
        setDragStart(coords);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        const coords = getCoords(e);
        const x = Math.min(dragStart.x, coords.x);
        const y = Math.min(dragStart.y, coords.y);
        const w = Math.abs(coords.x - dragStart.x);
        const h = Math.abs(coords.y - dragStart.y);
        if (w > 5 && h > 5) {
            setCrop({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
        }
    };

    const handleMouseUp = () => {
        setDragging(false);
    };

    const handleCrop = () => {
        const img = imgRef.current;
        if (!img || crop.w < 10 || crop.h < 10) return;

        const offscreen = document.createElement('canvas');
        offscreen.width = crop.w;
        offscreen.height = crop.h;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        offscreen.toBlob((blob) => {
            if (blob) onCrop(blob);
        }, 'image/png');
    };

    return (
        <div className="cropper-overlay" onClick={onClose}>
            <div className="cropper-modal" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>✂️ Cắt ảnh</h3>
                <div className="cropper-canvas-wrap">
                    <canvas
                        ref={canvasRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        style={{ maxWidth: '100%', height: 'auto' }}
                    />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Kéo để chọn vùng cắt ({crop.w} × {crop.h}px)
                </p>
                <div className="cropper-actions">
                    <button className="btn-secondary" onClick={onClose}>Hủy</button>
                    <button className="btn-primary" onClick={handleCrop} disabled={crop.w < 10 || crop.h < 10}>
                        Cắt & Áp dụng
                    </button>
                </div>
            </div>
        </div>
    );
}
