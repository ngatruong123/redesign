'use client';

import type { MockupMask } from '@/types';

const BLEND_OPTIONS: MockupMask['blendMode'][] = ['normal', 'multiply', 'overlay', 'screen', 'soft-light'];

interface BlendControlsPanelProps {
    fitMode: MockupMask['fitMode'];
    setFitMode: (v: MockupMask['fitMode']) => void;
    blendMode: MockupMask['blendMode'];
    setBlendMode: (v: MockupMask['blendMode']) => void;
    opacity: number;
    setOpacity: (v: number) => void;
    shadowEnabled: boolean;
    setShadowEnabled: (v: boolean) => void;
    shadowBlur: number;
    setShadowBlur: (v: number) => void;
}

export default function BlendControlsPanel({
    fitMode, setFitMode,
    blendMode, setBlendMode,
    opacity, setOpacity,
    shadowEnabled, setShadowEnabled,
    shadowBlur, setShadowBlur,
}: BlendControlsPanelProps) {
    return (
        <div className="blend-controls" style={{
            display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
            marginTop: 12, padding: '12px 16px',
            background: 'var(--surface-2, #1a1a2e)', borderRadius: 8,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Fit:</label>
                <select
                    value={fitMode}
                    onChange={(e) => setFitMode(e.target.value as MockupMask['fitMode'])}
                    style={{
                        background: 'var(--surface-3, #252542)', color: 'inherit',
                        border: '1px solid var(--border, #333)', borderRadius: 4, padding: '4px 8px',
                    }}
                >
                    <option value="contain">Contain (giữ tỉ lệ)</option>
                    <option value="fill">Fill (kéo giãn)</option>
                </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Blend:</label>
                <select
                    value={blendMode}
                    onChange={(e) => setBlendMode(e.target.value as MockupMask['blendMode'])}
                    style={{
                        background: 'var(--surface-3, #252542)', color: 'inherit',
                        border: '1px solid var(--border, #333)', borderRadius: 4, padding: '4px 8px',
                    }}
                >
                    {BLEND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Opacity:</label>
                <input type="range" min="0" max="100" value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: 100 }} />
                <span style={{ fontSize: 12, minWidth: 32 }}>{opacity}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>
                    <input type="checkbox" checked={shadowEnabled}
                        onChange={(e) => setShadowEnabled(e.target.checked)} style={{ marginRight: 4 }} />
                    Shadow
                </label>
                {shadowEnabled && (
                    <>
                        <input type="range" min="0" max="50" value={shadowBlur}
                            onChange={(e) => setShadowBlur(Number(e.target.value))} style={{ width: 80 }} />
                        <span style={{ fontSize: 12 }}>{shadowBlur}px</span>
                    </>
                )}
            </div>
        </div>
    );
}
