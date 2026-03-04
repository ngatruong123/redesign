'use client';

import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import type { GeneratedVariation, MockupTemplate } from '@/types';

interface MockupAIPanelProps {
    selectedVariations: GeneratedVariation[];
    totalMockupCount: number;
    isTemplateReady: (t: MockupTemplate) => boolean;
    onClose: () => void;
}

export default function MockupAIPanel({ selectedVariations, totalMockupCount, isTemplateReady, onClose }: MockupAIPanelProps) {
    const { mockupTemplates, setGeneratedMockups, setError } = useWorkflowStore();
    const addToast = useToastStore((s) => s.addToast);

    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [aiPlacement, setAiPlacement] = useState<'auto' | 'center' | 'full' | 'wrap'>('auto');
    const [aiStyle, setAiStyle] = useState<'photorealistic' | 'studio' | 'flat-lay' | 'lifestyle' | 'artistic'>('photorealistic');
    const [aiImageSize, setAiImageSize] = useState<'1K' | '2K' | '4K'>('2K');
    const [aiAspectRatio, setAiAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
    const [aiPrompt, setAiPrompt] = useState('');

    const handleAIGenerateMockups = async () => {
        const templatesWithMask = mockupTemplates.filter(isTemplateReady);
        if (templatesWithMask.length === 0 || selectedVariations.length === 0) return;

        setIsAIGenerating(true);
        setError(null);
        setGeneratedMockups([]);

        try {
            const promptParts: string[] = [];
            if (aiPlacement !== 'auto') {
                const placementMap = {
                    center: 'Center the design on the product',
                    full: 'Make the design cover the entire product surface',
                    wrap: 'Wrap the design around the product naturally following its 3D shape',
                };
                promptParts.push(placementMap[aiPlacement]);
            }
            if (aiStyle !== 'photorealistic') {
                const styleMap = {
                    studio: 'Professional studio photography with clean background, perfect lighting',
                    'flat-lay': 'Flat-lay top-down product photography style on a clean surface',
                    lifestyle: 'Lifestyle scene with the product in a natural, real-world environment',
                    artistic: 'Creative artistic composition with dramatic lighting and mood',
                };
                promptParts.push(styleMap[aiStyle]);
            }
            if (aiPrompt.trim()) promptParts.push(aiPrompt.trim());
            const combinedPrompt = promptParts.length > 0 ? promptParts.join('. ') + '.' : undefined;

            const res = await fetch('/api/mockup/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateIds: templatesWithMask.map(t => t.id),
                    variationIds: selectedVariations.map(v => v.id),
                    templates: templatesWithMask.map(t => ({ id: t.id, name: t.name, imageUrl: t.imageUrl })),
                    variations: selectedVariations.map(v => ({ id: v.id, name: v.styleName, imageUrl: v.imageUrl })),
                    prompt: combinedPrompt,
                    imageSize: aiImageSize,
                    aspectRatio: aiAspectRatio,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setGeneratedMockups(data.results);
            addToast('success', `AI đã tạo ${data.results.length} mockup!`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Tạo AI mockup thất bại';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsAIGenerating(false);
        }
    };

    return (
        <div className="ai-options-panel">
            <div className="ai-options-header">
                <h4>Tuỳ chỉnh AI Mockup</h4>
                <button className="btn-icon-sm" onClick={onClose}>✕</button>
            </div>

            <div className="ai-options-grid">
                <div className="ai-option-group">
                    <label>Vị trí đặt design</label>
                    <div className="ai-option-chips">
                        {([['auto', 'Tự động'], ['center', 'Chính giữa'], ['full', 'Phủ toàn bộ'], ['wrap', 'Bọc quanh']] as const).map(([val, label]) => (
                            <button key={val} className={`ai-chip ${aiPlacement === val ? 'active' : ''}`} onClick={() => setAiPlacement(val)}>{label}</button>
                        ))}
                    </div>
                </div>

                <div className="ai-option-group">
                    <label>Phong cách chụp</label>
                    <div className="ai-option-chips">
                        {([['photorealistic', 'Chân thực'], ['studio', 'Studio'], ['flat-lay', 'Flat Lay'], ['lifestyle', 'Đời thường'], ['artistic', 'Nghệ thuật']] as const).map(([val, label]) => (
                            <button key={val} className={`ai-chip ${aiStyle === val ? 'active' : ''}`} onClick={() => setAiStyle(val)}>{label}</button>
                        ))}
                    </div>
                </div>

                <div className="ai-option-group">
                    <label>Độ phân giải</label>
                    <div className="ai-option-chips">
                        {([['1K', '1K'], ['2K', '2K'], ['4K', '4K']] as const).map(([val, label]) => (
                            <button key={val} className={`ai-chip ${aiImageSize === val ? 'active' : ''}`} onClick={() => setAiImageSize(val)}>{label}</button>
                        ))}
                    </div>
                </div>

                <div className="ai-option-group">
                    <label>Tỷ lệ khung hình</label>
                    <div className="ai-option-chips">
                        {([['1:1', '1:1'], ['3:4', '3:4'], ['4:3', '4:3'], ['9:16', '9:16'], ['16:9', '16:9']] as const).map(([val, label]) => (
                            <button key={val} className={`ai-chip ${aiAspectRatio === val ? 'active' : ''}`} onClick={() => setAiAspectRatio(val)}>{label}</button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="ai-option-group" style={{ marginTop: 8 }}>
                <label>Prompt tuỳ chỉnh (không bắt buộc)</label>
                <textarea
                    className="ai-prompt-input"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="VD: Đặt design ở mặt trước áo, thêm bóng đổ nhẹ, ánh sáng studio ấm, nền trắng..."
                    rows={3}
                />
            </div>

            <button
                className="btn-primary btn-lg"
                disabled={totalMockupCount === 0 || isAIGenerating}
                onClick={handleAIGenerateMockups}
                style={{ marginTop: 8, width: '100%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
                {isAIGenerating ? <><span className="spinner-sm" /> AI đang tạo...</>
                    : `Tạo ${totalMockupCount} AI Mockup`}
            </button>
        </div>
    );
}
