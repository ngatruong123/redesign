'use client';

import { useState, useCallback } from 'react';

interface RemoveBgButtonProps {
    imageUrl: string;
    onResult: (newUrl: string) => void;
}

export default function RemoveBgButton({ imageUrl, onResult }: RemoveBgButtonProps) {
    const [removing, setRemoving] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleRemoveBg = useCallback(async () => {
        if (removing) return;
        setRemoving(true);
        setProgress(10);

        try {
            // Use server-side Gemini API for reliable background removal
            setProgress(30);
            const res = await fetch('/api/remove-bg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl }),
            });
            setProgress(80);

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setProgress(100);
            onResult(data.url);
        } catch (err) {
            console.error('BG removal failed:', err);
        } finally {
            setRemoving(false);
            setProgress(0);
        }
    }, [imageUrl, onResult, removing]);

    return (
        <button className="btn-remove-bg" onClick={handleRemoveBg} disabled={removing}>
            <span className="remove-bg-icon">🪄</span>
            {removing ? 'Đang xóa nền...' : 'Xóa nền'}
            {removing && (
                <div className="remove-bg-progress">
                    <div className="remove-bg-progress-bar" style={{ width: `${progress}%` }} />
                </div>
            )}
        </button>
    );
}
