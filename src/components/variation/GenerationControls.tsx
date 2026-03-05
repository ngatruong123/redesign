'use client';

import { useState } from 'react';

interface GenerationControlsProps {
    selectedStyleCount: number;
    additionalPrompt: string;
    onAdditionalPromptChange: (value: string) => void;
    isGenerating: boolean;
    streamProgress: { done: number; total: number } | null;
    onGenerate: () => void;
    imageSize: '1K' | '2K' | '4K';
    onImageSizeChange: (size: '1K' | '2K' | '4K') => void;
    aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
    onAspectRatioChange: (ratio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9') => void;
}

export default function GenerationControls({
    selectedStyleCount,
    additionalPrompt,
    onAdditionalPromptChange,
    isGenerating,
    streamProgress,
    onGenerate,
    imageSize,
    onImageSizeChange,
    aspectRatio,
    onAspectRatioChange,
}: GenerationControlsProps) {
    const [showAdvanced, setShowAdvanced] = useState(false);

    return (
        <div className="prompt-section">
            <label>{selectedStyleCount > 0 ? 'Prompt bổ sung (tùy chọn)' : 'Nhập prompt để tạo ảnh'}</label>
            <div className="prompt-input-row">
                <input
                    type="text"
                    placeholder={selectedStyleCount > 0 ? 'VD: thêm hoa văn, đổi màu nền...' : 'VD: chuyển sang phong cách watercolor, thêm hoa...'}
                    value={additionalPrompt}
                    onChange={(e) => onAdditionalPromptChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !isGenerating) onGenerate(); }}
                    disabled={isGenerating}
                />
                <button
                    className="btn-primary"
                    onClick={onGenerate}
                    disabled={isGenerating || (selectedStyleCount === 0 && !additionalPrompt.trim())}
                >
                    {isGenerating && streamProgress
                        ? <><span className="spinner-sm" /> {streamProgress.done}/{streamProgress.total} hoàn thành</>
                        : isGenerating
                            ? <><span className="spinner-sm" /> Đang tạo...</>
                            : selectedStyleCount > 0
                                ? `Tạo ${selectedStyleCount} biến thể`
                                : 'Tạo từ prompt'}
                </button>
            </div>

            {isGenerating && streamProgress && streamProgress.total > 0 && (
                <div className="generation-progress">
                    <div className="generation-progress-bar">
                        <div
                            className="generation-progress-fill"
                            style={{ width: `${(streamProgress.done / streamProgress.total) * 100}%` }}
                        />
                    </div>
                    <span className="generation-progress-text">
                        {streamProgress.done}/{streamProgress.total} hoàn thành
                    </span>
                </div>
            )}

            <button
                className="btn-ghost-sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ marginTop: 6, fontSize: '0.78rem' }}
            >
                {showAdvanced ? '▾ Ẩn tuỳ chỉnh nâng cao' : '▸ Tuỳ chỉnh nâng cao (độ phân giải, tỷ lệ)'}
            </button>

            {showAdvanced && (
                <div className="ai-options-grid" style={{ marginTop: 8 }}>
                    <div className="ai-option-group">
                        <label>Độ phân giải</label>
                        <div className="ai-option-chips">
                            {([['1K', '1K'], ['2K', '2K'], ['4K', '4K']] as const).map(([val, label]) => (
                                <button key={val} className={`ai-chip ${imageSize === val ? 'active' : ''}`} onClick={() => onImageSizeChange(val)}>{label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="ai-option-group">
                        <label>Tỷ lệ khung hình</label>
                        <div className="ai-option-chips">
                            {([['1:1', '1:1'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9']] as const).map(([val, label]) => (
                                <button key={val} className={`ai-chip ${aspectRatio === val ? 'active' : ''}`} onClick={() => onAspectRatioChange(val)}>{label}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
