'use client';

import { useToastStore } from '@/store/toast-store';

const ICONS: Record<string, string> = {
    error: '❌',
    success: '✅',
    info: 'ℹ️',
    warning: '⚠️',
};

export default function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">{ICONS[toast.type]}</span>
                    <span className="toast-message">{toast.message}</span>
                    <button className="toast-close" onClick={() => removeToast(toast.id)}>✕</button>
                </div>
            ))}
        </div>
    );
}
