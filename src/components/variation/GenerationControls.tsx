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
    // Ideogram-specific
    provider?: string;
    renderingSpeed?: string;
    onRenderingSpeedChange?: (speed: string) => void;
    styleType?: string;
    onStyleTypeChange?: (style: string) => void;
    imageWeight?: number;
    onImageWeightChange?: (weight: number) => void;
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
    provider,
    renderingSpeed,
    onRenderingSpeedChange,
    styleType,
    onStyleTypeChange,
    imageWeight,
    onImageWeightChange,
}: GenerationControlsProps) {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const isIdeogram = provider === 'ideogram';

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
                    {/* Gemini: image size */}
                    {!isIdeogram && (
                        <div className="ai-option-group">
                            <label>Độ phân giải</label>
                            <div className="ai-option-chips">
                                {([['1K', '1K'], ['2K', '2K'], ['4K', '4K']] as const).map(([val, label]) => (
                                    <button key={val} className={`ai-chip ${imageSize === val ? 'active' : ''}`} onClick={() => onImageSizeChange(val)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Common: aspect ratio */}
                    <div className="ai-option-group">
                        <label>Tỷ lệ khung hình</label>
                        <div className="ai-option-chips">
                            {([['1:1', '1:1'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9']] as const).map(([val, label]) => (
                                <button key={val} className={`ai-chip ${aspectRatio === val ? 'active' : ''}`} onClick={() => onAspectRatioChange(val)}>{label}</button>
                            ))}
                        </div>
                    </div>

                    {/* Ideogram: rendering speed */}
                    {isIdeogram && onRenderingSpeedChange && (
                        <div className="ai-option-group">
                            <label>Tốc độ render</label>
                            <div className="ai-option-chips">
                                {(['FLASH', 'TURBO', 'DEFAULT', 'QUALITY'] as const).map((val) => (
                                    <button key={val} className={`ai-chip ${renderingSpeed === val ? 'active' : ''}`} onClick={() => onRenderingSpeedChange(val)}>{val}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Ideogram: style type */}
                    {isIdeogram && onStyleTypeChange && (
                        <div className="ai-option-group">
                            <label>Phong cách</label>
                            <div className="ai-option-chips">
                                {([['AUTO', 'Auto'], ['GENERAL', 'General'], ['REALISTIC', 'Realistic'], ['DESIGN', 'Design'], ['FICTION', 'Fiction'], ['ANIME', 'Anime']] as const).map(([val, label]) => (
                                    <button key={val} className={`ai-chip ${styleType === val ? 'active' : ''}`} onClick={() => onStyleTypeChange(val)}>{label}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Ideogram: image weight */}
                    {isIdeogram && onImageWeightChange && (
                        <div className="ai-option-group">
                            <label>Độ giữ ảnh gốc: {imageWeight ?? 50}%</label>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={imageWeight ?? 50}
                                onChange={(e) => onImageWeightChange(Number(e.target.value))}
                                style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', opacity: 0.6 }}>
                                <span>Sáng tạo hơn</span>
                                <span>Giữ nguyên hơn</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
