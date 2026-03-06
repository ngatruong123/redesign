'use client';

import { useState, useEffect } from 'react';
import type { MockupMask } from '@/types';

export function useMockupBlend(activeTemplateId: string | null) {
    const [fitMode, setFitMode] = useState<MockupMask['fitMode']>('contain');
    const [blendMode, setBlendMode] = useState<MockupMask['blendMode']>('normal');
    const [opacity, setOpacity] = useState(100);
    const [shadowEnabled, setShadowEnabled] = useState(false);
    const [shadowBlur, setShadowBlur] = useState(10);
    const [bgBlurEnabled, setBgBlurEnabled] = useState(false);
    const [bgBlur, setBgBlur] = useState(5);

    const restoreFromMask = (mask: MockupMask | null | undefined) => {
        if (mask) {
            setFitMode(mask.fitMode || 'contain');
            setBlendMode(mask.blendMode || 'normal');
            setOpacity(mask.opacity ?? 100);
            setShadowEnabled(!!mask.shadow);
            setShadowBlur(mask.shadow?.blur ?? 10);
            setBgBlurEnabled(!!mask.backgroundBlur && mask.backgroundBlur > 0);
            setBgBlur(mask.backgroundBlur || 5);
        } else {
            setFitMode('contain');
            setBlendMode('normal');
            setOpacity(100);
            setShadowEnabled(false);
            setShadowBlur(10);
            setBgBlurEnabled(false);
            setBgBlur(5);
        }
    };

    return {
        fitMode, setFitMode,
        blendMode, setBlendMode,
        opacity, setOpacity,
        shadowEnabled, setShadowEnabled,
        shadowBlur, setShadowBlur,
        bgBlurEnabled, setBgBlurEnabled,
        bgBlur, setBgBlur,
        restoreFromMask,
    };
}
