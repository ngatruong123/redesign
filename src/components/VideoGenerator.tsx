'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWorkflowStore } from '@/store/workflow-store';
import { useToastStore } from '@/store/toast-store';

export default function VideoGenerator() {
    const { videoGeneration, setVideoGeneration, setStep } = useWorkflowStore();
    const addToast = useToastStore((s) => s.addToast);
    const [prompt, setPrompt] = useState(videoGeneration?.prompt || '');
    const [duration, setDuration] = useState(8);
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    useEffect(() => () => stopPolling(), [stopPolling]);

    // Poll for status when generating
    useEffect(() => {
        if (videoGeneration?.status !== 'generating' || !videoGeneration.operationName) return;
        stopPolling();

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/generate-video/status?op=${encodeURIComponent(videoGeneration.operationName!)}`);

                // Rate limited or transient error — just wait for next poll
                if (res.status === 429 || res.status === 503) return;

                const data = await res.json();

                if (data.status === 'done') {
                    setVideoGeneration({ ...videoGeneration, status: 'done', videoUrl: data.videoUrl });
                    addToast('success', 'Video generated!');
                    stopPolling();
                } else if (data.status === 'error' || data.error) {
                    const errMsg = data.debug ? `${data.error}\n\nDebug: ${data.debug}` : data.error;
                    setVideoGeneration({ ...videoGeneration, status: 'error', error: errMsg });
                    addToast('error', data.error || 'Video generation failed');
                    stopPolling();
                }
            } catch {
                // network error, keep polling
            }
        }, 15000);
    }, [videoGeneration?.status, videoGeneration?.operationName]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGenerate = async () => {
        if (!videoGeneration || !prompt.trim()) return;

        const updated = { ...videoGeneration, prompt: prompt.trim(), status: 'generating' as const };
        setVideoGeneration(updated);

        try {
            const res = await fetch('/api/generate-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: videoGeneration.mockupImageUrl, prompt: prompt.trim(), duration, aspectRatio }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setVideoGeneration({ ...updated, operationName: data.operationName });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to start video generation';
            setVideoGeneration({ ...updated, status: 'error', error: msg });
            addToast('error', msg);
        }
    };

    const handleDownload = () => {
        if (!videoGeneration?.videoUrl) return;
        const a = document.createElement('a');
        a.href = `${videoGeneration.videoUrl}?dl=mockup-video.mp4`;
        a.download = 'mockup-video.mp4';
        a.click();
    };

    if (!videoGeneration) {
        return (
            <div className="video-generator" style={{ textAlign: 'center', padding: 40 }}>
                <p>Chưa chọn mockup nào để tạo video.</p>
                <button className="btn-ghost" onClick={() => setStep('mockup')}>← Quay lại Mockup</button>
            </div>
        );
    }

    const isGenerating = videoGeneration.status === 'generating';
    const isDone = videoGeneration.status === 'done';
    const isError = videoGeneration.status === 'error';

    return (
        <div className="video-generator" style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button className="btn-ghost" onClick={() => setStep('mockup')}>← Quay lại</button>
                <h2 style={{ margin: 0, fontSize: 20 }}>Tạo Video từ Mockup</h2>
            </div>

            {/* Mockup preview */}
            <div style={{
                borderRadius: 12, overflow: 'hidden', marginBottom: 20,
                border: '1px solid var(--border, #333)',
            }}>
                <img
                    src={videoGeneration.mockupImageUrl}
                    alt="Mockup preview"
                    style={{ width: '100%', display: 'block' }}
                />
            </div>

            {/* Prompt */}
            <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, opacity: 0.8 }}>
                    Mô tả video bạn muốn tạo:
                </label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ví dụ: Camera slowly zooms in on the product with soft lighting..."
                    disabled={isGenerating}
                    rows={4}
                    style={{
                        width: '100%', padding: 12, borderRadius: 8, fontSize: 14,
                        background: 'var(--surface-2, #1a1a2e)', color: 'inherit',
                        border: '1px solid var(--border, #333)', resize: 'vertical',
                    }}
                />
            </div>

            {/* Duration & Aspect Ratio */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, opacity: 0.8 }}>
                        Thời lượng:
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {[4, 6, 8].map((d) => (
                            <button
                                key={d}
                                disabled={isGenerating}
                                onClick={() => setDuration(d)}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600,
                                    border: duration === d ? '2px solid var(--accent, #7c3aed)' : '1px solid var(--border, #333)',
                                    background: duration === d ? 'rgba(124, 58, 237, 0.15)' : 'var(--surface-2, #1a1a2e)',
                                    color: duration === d ? 'var(--accent, #7c3aed)' : 'inherit',
                                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {d}s
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: 14, opacity: 0.8 }}>
                        Tỉ lệ:
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {([['16:9', '▬'], ['9:16', '▮']] as const).map(([ratio, icon]) => (
                            <button
                                key={ratio}
                                disabled={isGenerating}
                                onClick={() => setAspectRatio(ratio)}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600,
                                    border: aspectRatio === ratio ? '2px solid var(--accent, #7c3aed)' : '1px solid var(--border, #333)',
                                    background: aspectRatio === ratio ? 'rgba(124, 58, 237, 0.15)' : 'var(--surface-2, #1a1a2e)',
                                    color: aspectRatio === ratio ? 'var(--accent, #7c3aed)' : 'inherit',
                                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {icon} {ratio}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Generate button */}
            <button
                className="btn-primary btn-lg"
                disabled={isGenerating || !prompt.trim()}
                onClick={handleGenerate}
                style={{ width: '100%', marginBottom: 20 }}
            >
                {isGenerating ? (
                    <><span className="spinner-sm" /> Đang tạo video...</>
                ) : (
                    'Tạo Video'
                )}
            </button>

            {/* Error */}
            {isError && videoGeneration.error && (
                <div style={{
                    padding: 12, borderRadius: 8, marginBottom: 20,
                    background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)',
                    color: '#ff6b6b', fontSize: 14,
                }}>
                    {videoGeneration.error}
                </div>
            )}

            {/* Video player */}
            {isDone && videoGeneration.videoUrl && (
                <div style={{ marginBottom: 20 }}>
                    <video
                        src={videoGeneration.videoUrl}
                        controls
                        autoPlay
                        loop
                        style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border, #333)' }}
                    />
                    <button
                        className="btn-primary"
                        onClick={handleDownload}
                        style={{ marginTop: 12, width: '100%' }}
                    >
                        Download Video
                    </button>
                </div>
            )}
        </div>
    );
}
