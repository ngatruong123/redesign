'use client';

import { useState } from 'react';
import RemoveBgPanel from './RemoveBgPanel';

interface RemoveBgButtonProps {
    imageUrl: string;
    onResult: (newUrl: string) => void;
}

export default function RemoveBgButton({ imageUrl, onResult }: RemoveBgButtonProps) {
    const [showPanel, setShowPanel] = useState(false);

    return (
        <>
            <button className="btn-remove-bg" onClick={() => setShowPanel(true)}>
                <span className="remove-bg-icon">🪄</span>
                Xóa nền
            </button>
            {showPanel && (
                <RemoveBgPanel
                    imageUrl={imageUrl}
                    onResult={onResult}
                    onClose={() => setShowPanel(false)}
                />
            )}
        </>
    );
}
