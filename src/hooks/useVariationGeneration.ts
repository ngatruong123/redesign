'use client';

import { useState, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';
import { DEFAULT_STYLE_PRESETS } from '@/lib/prompt-engine';

const STYLE_PRESETS = DEFAULT_STYLE_PRESETS;

export function useVariationGeneration() {
    const {
        sourceDesigns, variations, setVariations,
        isGenerating, setIsGenerating, setError, updateVariation,
    } = useWorkflowStore();

    const addToast = useToastStore((s) => s.addToast);

    const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [streamProgress, setStreamProgress] = useState<{ done: number; total: number } | null>(null);
    const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('2K');
    const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
    const [originalUrls, setOriginalUrls] = useState<Record<string, string>>({});
    const [bgRemoved, setBgRemoved] = useState<Set<string>>(new Set());
    const [bgProcessing, setBgProcessing] = useState<Set<string>>(new Set());

    const toggleStyle = (id: string) => {
        setSelectedStyles((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleGenerate = async () => {
        if (sourceDesigns.length === 0) return;

        let styles: { id: string; name: string; prompt: string; icon?: string }[];
        if (selectedStyles.size > 0) {
            styles = STYLE_PRESETS.filter((s) => selectedStyles.has(s.id));
        } else if (additionalPrompt.trim()) {
            const customId = `custom-${Date.now()}`;
            styles = [{ id: customId, name: additionalPrompt.trim().slice(0, 40), prompt: additionalPrompt.trim() }];
        } else {
            return;
        }

        setIsGenerating(true);
        setError(null);

        const placeholders = sourceDesigns.flatMap((design) =>
            styles.map((s) => ({
                id: `${design.id}_${s.id}`,
                styleId: s.id,
                styleName: s.name,
                imageUrl: '',
                selected: false,
                loading: true,
                sourceDesignId: design.id,
                sourceDesignName: design.name,
            }))
        );
        setVariations(placeholders);
        const totalCount = placeholders.length;
        setStreamProgress({ done: 0, total: totalCount });

        try {
            const sourceImageUrls = sourceDesigns.map((d) => ({ id: d.id, url: d.url }));
            const res = await fetch('/api/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceImageUrls,
                    styles,
                    additionalPrompt,
                    imageSize,
                    aspectRatio,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Generation failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream');

            const decoder = new TextDecoder();
            let buffer = '';
            let doneCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr || jsonStr === '[DONE]') continue;
                    try {
                        const variation = JSON.parse(jsonStr);
                        doneCount++;
                        setStreamProgress({ done: doneCount, total: totalCount });
                        const compositeId = `${variation.sourceDesignId}_${variation.styleId}`;
                        const srcDesign = sourceDesigns.find(d => d.id === variation.sourceDesignId);
                        updateVariation(compositeId, {
                            imageUrl: variation.imageUrl,
                            loading: false,
                            sourceDesignId: variation.sourceDesignId,
                            sourceDesignName: srcDesign?.name || variation.sourceDesignId?.slice(0, 8),
                        });
                    } catch {
                        // skip malformed SSE
                    }
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Generation failed';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsGenerating(false);
            setStreamProgress(null);
        }
    };

    const handleRegenerate = async (variationId: string) => {
        const v = variations.find((v) => v.id === variationId);
        if (!v) return;

        const sourceDesign = sourceDesigns.find((d) => d.id === v.sourceDesignId) || sourceDesigns[0];
        if (!sourceDesign) return;

        let style = STYLE_PRESETS.find((s) => s.id === v.styleId);
        if (!style) {
            style = { id: v.styleId, name: v.styleName, prompt: v.styleName, icon: '' };
        }

        updateVariation(variationId, { loading: true, imageUrl: '' });

        try {
            const res = await fetch('/api/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceImageUrls: [{ id: sourceDesign.id, url: sourceDesign.url }],
                    styles: [style],
                    additionalPrompt: style.id.startsWith('custom-') ? '' : additionalPrompt,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Regeneration failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No stream');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr || jsonStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        updateVariation(variationId, {
                            imageUrl: parsed.imageUrl,
                            loading: false,
                        });
                    } catch {
                        // skip
                    }
                }
            }
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Regeneration failed');
            updateVariation(variationId, { loading: false });
        }
    };

    const handleToggleBg = useCallback(async (variationId: string, currentUrl: string) => {
        if (bgProcessing.has(variationId)) return;

        if (bgRemoved.has(variationId)) {
            const orig = originalUrls[variationId];
            if (orig) {
                updateVariation(variationId, { imageUrl: orig });
                setBgRemoved((prev) => { const next = new Set(prev); next.delete(variationId); return next; });
            }
            return;
        }

        setOriginalUrls((prev) => ({ ...prev, [variationId]: currentUrl }));
        setBgProcessing((prev) => new Set(prev).add(variationId));

        try {
            const res = await fetch('/api/remove-bg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: currentUrl, mode: 'transparent' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            updateVariation(variationId, { imageUrl: data.url });
            setBgRemoved((prev) => new Set(prev).add(variationId));
        } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Xoá nền thất bại');
        } finally {
            setBgProcessing((prev) => { const next = new Set(prev); next.delete(variationId); return next; });
        }
    }, [bgProcessing, bgRemoved, originalUrls, updateVariation, addToast]);

    return {
        // Style selection
        selectedStyles,
        setSelectedStyles,
        toggleStyle,
        // Prompt & settings
        additionalPrompt,
        setAdditionalPrompt,
        imageSize,
        setImageSize,
        aspectRatio,
        setAspectRatio,
        // Generation
        streamProgress,
        handleGenerate,
        handleRegenerate,
        // Background removal
        bgRemoved,
        bgProcessing,
        handleToggleBg,
    };
}
