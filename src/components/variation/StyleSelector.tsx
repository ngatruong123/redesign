'use client';

import type { StylePreset } from '@/types';

interface StyleSelectorProps {
    presets: StylePreset[];
    selectedStyles: Set<string>;
    onToggleStyle: (id: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    disabled?: boolean;
}

export default function StyleSelector({
    presets,
    selectedStyles,
    onToggleStyle,
    onSelectAll,
    onDeselectAll,
    disabled,
}: StyleSelectorProps) {
    return (
        <div className="style-picker">
            <div className="style-picker-header">
                <h3>Chọn phong cách ({selectedStyles.size}/{presets.length})</h3>
                <div className="style-picker-actions">
                    {selectedStyles.size > 0 && <span className="style-picker-count">{selectedStyles.size} selected</span>}
                    <button className="btn-ghost-sm" onClick={onSelectAll}>Chọn tất cả</button>
                    <button className="btn-ghost-sm" onClick={onDeselectAll}>Bỏ chọn</button>
                </div>
            </div>
            <div className="style-chips">
                {presets.map((style) => (
                    <button
                        key={style.id}
                        className={`style-chip ${selectedStyles.has(style.id) ? 'picked' : ''}`}
                        onClick={() => onToggleStyle(style.id)}
                        disabled={disabled}
                    >
                        <span className="style-chip-icon">{style.icon}</span>
                        <span className="style-chip-name">{style.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
