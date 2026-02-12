import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastState {
    toasts: Toast[];
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    addToast: (type, message) => {
        const id = String(++nextId);
        set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
        setTimeout(() => {
            set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
        }, 5000);
    },
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
