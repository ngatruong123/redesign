'use client';

import { useEffect, useCallback } from 'react';

interface LightboxProps {
    imageUrl: string;
    alt: string;
    onClose: () => void;
}

export default function Lightbox({ imageUrl, alt, onClose }: LightboxProps) {
    // Close on Escape key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [handleKeyDown]);

    return (
        <div className="lightbox-overlay" onClick={onClose}>
            <button className="lightbox-close" onClick={onClose}>✕</button>
            <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                <img src={imageUrl} alt={alt} className="lightbox-image" />
                {alt && <span className="lightbox-caption">{alt}</span>}
            </div>
        </div>
    );
}
