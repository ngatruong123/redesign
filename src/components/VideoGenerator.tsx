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
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, []);

    useEffect(() => () => stopPolling(), [stopPolling]);

    useEffect(() => {
        if (videoGeneration?.status !== 'generating' || !videoGeneration.operationName) return;
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/generate-video/status?op=${encodeURIComponent(videoGeneration.operationName!)}`);
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
            } catch { /* network error, keep polling */ }
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

    const [downloadingVideo, setDownloadingVideo] = useState(false);
    const handleDownload = async () => {
        if (!videoGeneration?.videoUrl) return;
        setDownloadingVideo(true);
        try {
            const res = await fetch(videoGeneration.videoUrl);
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'mockup-video.mp4';
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            addToast('error', `Download thất bại: ${err instanceof Error ? err.message : 'Unknown'}`);
        } finally { setDownloadingVideo(false); }
    };

    if (!videoGeneration) {
        return (
            <div className="video-generator video-generator--empty">
                <p>Chưa chọn mockup nào để tạo video.</p>
                <button className="btn-ghost" onClick={() => setStep('mockup')}>← Quay lại Mockup</button>
            </div>
        );
    }

    const isGenerating = videoGeneration.status === 'generating';
    const isDone = videoGeneration.status === 'done';
    const isError = videoGeneration.status === 'error';

    return (
        <div className="video-generator">
            <div className="video-header">
                <button className="btn-ghost" onClick={() => setStep('mockup')}>← Quay lại</button>
                <h2>Tạo Video từ Mockup</h2>
            </div>

            <div className="video-preview">
                <img src={videoGeneration.mockupImageUrl} alt="Mockup preview" />
            </div>

            <div className="video-prompt-section">
                <label className="video-label">Mô tả video bạn muốn tạo:</label>
                <textarea
                    className="video-textarea"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ví dụ: Camera slowly zooms in on the product with soft lighting..."
                    disabled={isGenerating}
                    rows={4}
                />
            </div>

            <div className="video-options-row">
                <div className="video-option-group">
                    <label className="video-label">Thời lượng:</label>
                    <div className="video-option-btns">
                        {[4, 6, 8].map((d) => (
                            <button
                                key={d}
                                className={`video-option-btn ${duration === d ? 'video-option-btn--active' : ''}`}
                                disabled={isGenerating}
                                onClick={() => setDuration(d)}
                            >{d}s</button>
                        ))}
                    </div>
                </div>
                <div className="video-option-group">
                    <label className="video-label">Tỉ lệ:</label>
                    <div className="video-option-btns">
                        {([['16:9', '▬'], ['9:16', '▮']] as const).map(([ratio, icon]) => (
                            <button
                                key={ratio}
                                className={`video-option-btn ${aspectRatio === ratio ? 'video-option-btn--active' : ''}`}
                                disabled={isGenerating}
                                onClick={() => setAspectRatio(ratio)}
                            >{icon} {ratio}</button>
                        ))}
                    </div>
                </div>
            </div>

            <button className="btn-primary btn-lg video-generate-btn" disabled={isGenerating || !prompt.trim()} onClick={handleGenerate}>
                {isGenerating ? <><span className="spinner-sm" /> Đang tạo video...</> : 'Tạo Video'}
            </button>

            {isError && videoGeneration.error && (
                <div className="video-error">
                    <span>{videoGeneration.error}</span>
                    <button className="btn-ghost-sm" onClick={handleGenerate}>Thử lại</button>
                </div>
            )}

            {isDone && videoGeneration.videoUrl && (
                <div className="video-result">
                    <video src={videoGeneration.videoUrl} controls autoPlay loop />
                    <button className="btn-primary video-download-btn" onClick={handleDownload} disabled={downloadingVideo}>
                        {downloadingVideo ? <><span className="spinner-sm" /> Đang tải...</> : 'Download Video'}
                    </button>
                </div>
            )}
        </div>
    );
}
