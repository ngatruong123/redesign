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
    bgBlurEnabled: boolean;
    setBgBlurEnabled: (v: boolean) => void;
    bgBlur: number;
    setBgBlur: (v: number) => void;
}

export default function BlendControlsPanel({
    fitMode, setFitMode,
    blendMode, setBlendMode,
    opacity, setOpacity,
    shadowEnabled, setShadowEnabled,
    shadowBlur, setShadowBlur,
    bgBlurEnabled, setBgBlurEnabled,
    bgBlur, setBgBlur,
}: BlendControlsPanelProps) {
    return (
        <div className="blend-controls">
            <div className="blend-control-group">
                <label>Vừa khung:</label>
                <select
                    value={fitMode}
                    onChange={(e) => setFitMode(e.target.value as MockupMask['fitMode'])}
                >
                    <option value="contain">Giữ tỉ lệ</option>
                    <option value="fill">Kéo giãn</option>
                </select>
            </div>
            <div className="blend-control-group">
                <label>Hoà trộn:</label>
                <select
                    value={blendMode}
                    onChange={(e) => setBlendMode(e.target.value as MockupMask['blendMode'])}
                >
                    {BLEND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
            </div>
            <div className="blend-control-group">
                <label>Độ mờ:</label>
                <input type="range" min="0" max="100" value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))} />
                <span className="blend-value">{opacity}%</span>
            </div>
            <div className="blend-control-group">
                <label>
                    <input type="checkbox" checked={shadowEnabled}
                        onChange={(e) => setShadowEnabled(e.target.checked)} />
                    Đổ bóng
                </label>
                {shadowEnabled && (
                    <>
                        <input type="range" min="0" max="50" value={shadowBlur}
                            onChange={(e) => setShadowBlur(Number(e.target.value))} />
                        <span className="blend-value">{shadowBlur}px</span>
                    </>
                )}
            </div>
            <div className="blend-control-group">
                <label>
                    <input type="checkbox" checked={bgBlurEnabled}
                        onChange={(e) => setBgBlurEnabled(e.target.checked)} />
                    Làm mờ nền
                </label>
                {bgBlurEnabled && (
                    <>
                        <input type="range" min="1" max="20" value={bgBlur}
                            onChange={(e) => setBgBlur(Number(e.target.value))} />
                        <span className="blend-value">{bgBlur}px</span>
                    </>
                )}
            </div>
        </div>
    );
}
