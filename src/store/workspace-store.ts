import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function getActiveUser(): string {
    if (typeof window === 'undefined') return 'default';
    return localStorage.getItem('design-tool-user') || 'default';
}

export interface Workspace {
    id: string;
    name: string;
    createdAt: number;
}

interface WorkspaceState {
    workspaces: Workspace[];
    activeId: string;
    createWorkspace: (name: string) => void;
    deleteWorkspace: (id: string) => void;
    switchWorkspace: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
    persist(
        (set, get) => ({
            workspaces: [{ id: 'default', name: 'Default', createdAt: 0 }],
            activeId: 'default',

            createWorkspace: (name) => {
                const id = typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : Date.now().toString(36) + Math.random().toString(36).slice(2);
                set((state) => ({
                    workspaces: [...state.workspaces, { id, name, createdAt: Date.now() }],
                }));
                // Switch to the new workspace
                get().switchWorkspace(id);
            },

            deleteWorkspace: (id) => {
                if (id === 'default') return;
                // Remove workspace data from localStorage
                try { localStorage.removeItem(`design-tool-${getActiveUser()}-ws-${id}`); } catch { /* ignore */ }
                const active = get().activeId;
                set((state) => ({
                    workspaces: state.workspaces.filter((w) => w.id !== id),
                    ...(active === id ? { activeId: 'default' } : {}),
                }));
                if (active === id) {
                    window.location.reload();
                }
            },

            switchWorkspace: (id) => {
                if (id === get().activeId) return;
                set({ activeId: id });
                window.location.reload();
            },
        }),
        { name: `design-tool-${getActiveUser()}-workspaces` }
    )
);
