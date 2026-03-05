'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { DesignOverlayState, MockupMask, Point } from '@/types';

interface DesignOverlayProps {
    overlay: DesignOverlayState;
    mask: MockupMask | null;
    canvasScale: number;
    canvasWidth: number;
    canvasHeight: number;
    onChange: (update: Partial<DesignOverlayState>) => void;
    onRemove: () => void;
    disabled?: boolean;
    opacity?: number;
    blendMode?: string;
    shadowEnabled?: boolean;
    shadowBlur?: number;
}

const SNAP_THRESHOLD = 5; // px in canvas space

type DragMode = 'move' | 'resize' | 'rotate' | 'crop' | null;
type Corner = 'tl' | 'tr' | 'br' | 'bl';
type Edge = 'top' | 'right' | 'bottom' | 'left';

export default function DesignOverlay({ overlay, mask, canvasScale, canvasWidth, canvasHeight, onChange, onRemove, disabled, opacity = 100, blendMode = 'normal', shadowEnabled = false, shadowBlur = 10 }: DesignOverlayProps) {
    const [mode, setMode] = useState<DragMode>(null);
    const [activeCorner, setActiveCorner] = useState<Corner | null>(null);
    const [activeEdge, setActiveEdge] = useState<Edge | null>(null);
    const [snapH, setSnapH] = useState(false);
    const [snapV, setSnapV] = useState(false);
    const startRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0, ow: 0, oh: 0, or: 0, ct: 0, cr: 0, cb: 0, cl: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const aspectRatio = overlay.naturalWidth / overlay.naturalHeight;
    const ct = overlay.cropTop ?? 0;
    const cr = overlay.cropRight ?? 0;
    const cb = overlay.cropBottom ?? 0;
    const cl = overlay.cropLeft ?? 0;

    // No longer clip to mask — allow design to be placed freely anywhere on the mockup

    const handlePointerDown = useCallback((e: React.PointerEvent, dragMode: DragMode, corner?: Corner, edge?: Edge) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setMode(dragMode);
        if (corner) setActiveCorner(corner);
        if (edge) setActiveEdge(edge);
        startRef.current = {
            mx: e.clientX,
            my: e.clientY,
            ox: overlay.x,
            oy: overlay.y,
            ow: overlay.width,
            oh: overlay.height,
            or: overlay.rotation,
            ct: overlay.cropTop ?? 0,
            cr: overlay.cropRight ?? 0,
            cb: overlay.cropBottom ?? 0,
            cl: overlay.cropLeft ?? 0,
        };
    }, [overlay]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!mode) return;
        e.preventDefault();
        const dx = (e.clientX - startRef.current.mx) / canvasScale;
        const dy = (e.clientY - startRef.current.my) / canvasScale;
        const s = startRef.current;

        if (mode === 'move') {
            let newX = s.ox + dx;
            let newY = s.oy + dy;
            // Only snap when not rotated (rotation breaks center alignment meaning)
            const canSnap = !overlay.rotation || overlay.rotation === 0;
            const centerX = newX + s.ow / 2;
            const centerY = newY + s.oh / 2;
            const midX = canvasWidth / 2;
            const midY = canvasHeight / 2;
            const isSnapH = canSnap && Math.abs(centerX - midX) < SNAP_THRESHOLD;
            const isSnapV = canSnap && Math.abs(centerY - midY) < SNAP_THRESHOLD;
            if (isSnapH) newX = midX - s.ow / 2;
            if (isSnapV) newY = midY - s.oh / 2;
            setSnapH(isSnapH);
            setSnapV(isSnapV);
            onChange({ x: newX, y: newY });
        } else if (mode === 'resize') {
            // Rotate screen-space delta into overlay's local space
            const rad = -(overlay.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const ldx = cos * dx - sin * dy;
            const ldy = sin * dx + cos * dy;

            let newW = s.ow;
            let newH = s.oh;
            let newX = s.ox;
            let newY = s.oy;

            if (activeCorner === 'br') {
                newW = Math.max(30, s.ow + ldx);
                newH = newW / aspectRatio;
            } else if (activeCorner === 'bl') {
                newW = Math.max(30, s.ow - ldx);
                newH = newW / aspectRatio;
                newX = s.ox + (s.ow - newW);
            } else if (activeCorner === 'tr') {
                newW = Math.max(30, s.ow + ldx);
                newH = newW / aspectRatio;
                newY = s.oy + (s.oh - newH);
            } else if (activeCorner === 'tl') {
                newW = Math.max(30, s.ow - ldx);
                newH = newW / aspectRatio;
                newX = s.ox + (s.ow - newW);
                newY = s.oy + (s.oh - newH);
            }
            onChange({ x: newX, y: newY, width: newW, height: newH });
        } else if (mode === 'rotate') {
            const rect = containerRef.current?.parentElement?.getBoundingClientRect();
            if (!rect) return;
            const centerX = (overlay.x + overlay.width / 2) * canvasScale + rect.left;
            const centerY = (overlay.y + overlay.height / 2) * canvasScale + rect.top;
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) + 90;
            onChange({ rotation: Math.round(angle) % 360 });
        } else if (mode === 'crop' && activeEdge) {
            // Rotate screen-space delta into overlay's local space
            const rad = -(overlay.rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const ldx = cos * dx - sin * dy;
            const ldy = sin * dx + cos * dy;

            const clamp = (v: number) => Math.max(0, Math.min(90, v));
            if (activeEdge === 'top') {
                onChange({ cropTop: clamp(s.ct + (ldy / s.oh) * 100) });
            } else if (activeEdge === 'bottom') {
                onChange({ cropBottom: clamp(s.cb - (ldy / s.oh) * 100) });
            } else if (activeEdge === 'left') {
                onChange({ cropLeft: clamp(s.cl + (ldx / s.ow) * 100) });
            } else if (activeEdge === 'right') {
                onChange({ cropRight: clamp(s.cr - (ldx / s.ow) * 100) });
            }
        }
    }, [mode, activeCorner, activeEdge, canvasScale, canvasWidth, canvasHeight, aspectRatio, onChange, overlay]);

    const handlePointerUp = useCallback(() => {
        setMode(null);
        setActiveCorner(null);
        setActiveEdge(null);
        setSnapH(false);
        setSnapV(false);
    }, []);

    // Keyboard: Delete to remove (works globally when overlay exists)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Don't trigger if user is typing in an input
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                onRemove();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onRemove]);

    const sc = canvasScale;
    const hasCrop = ct > 0 || cr > 0 || cb > 0 || cl > 0;

    // Crop clip on image only
    const imageClip = hasCrop ? `inset(${ct}% ${cr}% ${cb}% ${cl}%)` : undefined;

    return (
        <div
            ref={containerRef}
            className={`design-overlay${mode === 'crop' ? ' cropping' : ''}`}
            style={{
                position: 'absolute',
                left: overlay.x * sc,
                top: overlay.y * sc,
                width: overlay.width * sc,
                height: overlay.height * sc,
                transform: `rotate(${overlay.rotation}deg)`,
                transformOrigin: 'center center',
                // No clip-path here — handles must remain visible and interactive
                zIndex: 10,
                pointerEvents: disabled ? 'none' : 'auto',
                opacity: disabled ? 0.5 : undefined,
                cursor: mode === 'move' ? 'grabbing' : 'grab',
                outline: '1.5px solid rgba(160, 120, 255, 0.7)',
                borderRadius: 2,
                overflow: 'visible',
            }}
            tabIndex={0}
            onPointerDown={(e) => handlePointerDown(e, 'move')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {/* Image wrapper — clip-path applied here only */}
            <div style={{
                width: '100%',
                height: '100%',
                clipPath: imageClip,
                overflow: 'hidden',
                borderRadius: 2,
                opacity: opacity / 100,
                mixBlendMode: blendMode === 'normal' ? undefined : blendMode as React.CSSProperties['mixBlendMode'],
                filter: shadowEnabled ? `drop-shadow(0 0 ${shadowBlur}px rgba(0,0,0,0.5))` : undefined,
            }}>
                <img
                    src={overlay.imageUrl}
                    alt="Design overlay"
                    draggable={false}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'fill',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        display: 'block',
                    }}
                />
            </div>

            {/* Edge crop handles — positioned at current crop inset */}
            <div
                className="overlay-crop-handle overlay-crop-top"
                style={{ top: `${ct}%`, zIndex: 5 }}
                onPointerDown={(e) => handlePointerDown(e, 'crop', undefined, 'top')}
            />
            <div
                className="overlay-crop-handle overlay-crop-bottom"
                style={{ bottom: `${cb}%`, zIndex: 5 }}
                onPointerDown={(e) => handlePointerDown(e, 'crop', undefined, 'bottom')}
            />
            <div
                className="overlay-crop-handle overlay-crop-left"
                style={{ left: `${cl}%`, zIndex: 5 }}
                onPointerDown={(e) => handlePointerDown(e, 'crop', undefined, 'left')}
            />
            <div
                className="overlay-crop-handle overlay-crop-right"
                style={{ right: `${cr}%`, zIndex: 5 }}
                onPointerDown={(e) => handlePointerDown(e, 'crop', undefined, 'right')}
            />

            {/* Corner resize handles */}
            {(['tl', 'tr', 'br', 'bl'] as Corner[]).map((corner) => (
                <div
                    key={corner}
                    className="overlay-handle overlay-handle-resize"
                    style={{
                        position: 'absolute',
                        ...(corner.includes('t') ? { top: -5 } : { bottom: -5 }),
                        ...(corner.includes('l') ? { left: -5 } : { right: -5 }),
                        cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize',
                        zIndex: 2,
                    }}
                    onPointerDown={(e) => handlePointerDown(e, 'resize', corner)}
                />
            ))}

            {/* Floating toolbar above overlay */}
            <div className="overlay-toolbar" onPointerDown={(e) => e.stopPropagation()}>
                <button
                    className="overlay-toolbar-btn"
                    title="Xoay"
                    onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'rotate'); }}
                >
                    ↻
                </button>
                {hasCrop && (
                    <button
                        className="overlay-toolbar-btn"
                        title="Reset crop"
                        onClick={(e) => { e.stopPropagation(); onChange({ cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 }); }}
                    >
                        ⟲
                    </button>
                )}
                <button
                    className="overlay-toolbar-btn overlay-toolbar-btn--delete"
                    title="Xoá (Delete)"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                >
                    ✕
                </button>
            </div>

            {/* Center snap guides */}
            {snapV && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '50%',
                    width: canvasWidth * sc,
                    marginLeft: -(overlay.x * sc),
                    height: 0,
                    borderTop: '1px dashed rgba(255,100,100,0.8)',
                    pointerEvents: 'none',
                    zIndex: 20,
                }} />
            )}
            {snapH && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: '50%',
                    height: canvasHeight * sc,
                    marginTop: -(overlay.y * sc),
                    width: 0,
                    borderLeft: '1px dashed rgba(255,100,100,0.8)',
                    pointerEvents: 'none',
                    zIndex: 20,
                }} />
            )}

        </div>
    );
}
