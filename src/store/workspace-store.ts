import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useWorkflowStore } from '@/store/workflow-store';

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
    synced: boolean;
    createWorkspace: (name: string) => Promise<void>;
    deleteWorkspace: (id: string) => void;
    switchWorkspace: (id: string) => void;
    syncFromServer: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>()(
    persist(
        (set, get) => ({
            workspaces: [{ id: 'default', name: 'Default', createdAt: 0 }],
            activeId: 'default',
            synced: false,

            createWorkspace: async (name) => {
                let id: string;
                try {
                    const res = await fetch('/api/workspaces', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        id = data.id;
                    } else {
                        throw new Error('Server error');
                    }
                } catch {
                    // Fallback to local ID if server unavailable
                    id = typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID()
                        : Date.now().toString(36) + Math.random().toString(36).slice(2);
                }
                set((state) => ({
                    workspaces: [...state.workspaces, { id, name, createdAt: Date.now() }],
                }));
                get().switchWorkspace(id);
            },

            deleteWorkspace: (id) => {
                if (id === 'default') return;
                // Remove workspace data from localStorage
                try { localStorage.removeItem(`design-tool-${getActiveUser()}-ws-${id}`); } catch { /* ignore */ }
                // Delete from server
                fetch(`/api/workspaces/${id}`, { method: 'DELETE' }).catch(() => {});
                const active = get().activeId;
                set((state) => ({
                    workspaces: state.workspaces.filter((w) => w.id !== id),
                    ...(active === id ? { activeId: 'default' } : {}),
                }));
                if (active === id) {
                    useWorkflowStore.getState().reset();
                }
            },

            switchWorkspace: (id) => {
                if (id === get().activeId) return;
                set({ activeId: id });
                useWorkflowStore.getState().reset();
            },

            syncFromServer: async () => {
                if (get().synced) return;
                try {
                    const res = await fetch('/api/workspaces');
                    if (!res.ok) return;
                    const serverWorkspaces = await res.json();
                    if (Array.isArray(serverWorkspaces) && serverWorkspaces.length > 0) {
                        const merged = [{ id: 'default', name: 'Default', createdAt: 0 }];
                        const seenIds = new Set(['default']);
                        // Add server workspaces
                        for (const sw of serverWorkspaces) {
                            if (!seenIds.has(sw.id)) {
                                seenIds.add(sw.id);
                                merged.push({
                                    id: sw.id,
                                    name: sw.name,
                                    createdAt: new Date(sw.createdAt).getTime(),
                                });
                            }
                        }
                        // Also keep local workspaces that aren't on server yet
                        for (const lw of get().workspaces) {
                            if (!seenIds.has(lw.id)) {
                                seenIds.add(lw.id);
                                merged.push(lw);
                            }
                        }
                        set({ workspaces: merged, synced: true });
                    } else {
                        set({ synced: true });
                    }
                } catch {
                    // Server not available, use local only
                    set({ synced: true });
                }
            },
        }),
        {
            name: `design-tool-${getActiveUser()}-workspaces`,
            partialize: (state) => ({
                workspaces: state.workspaces,
                activeId: state.activeId,
            }),
        }
    )
);

// Auto-sync on client load
if (typeof window !== 'undefined') {
    // Small delay to ensure cookies are available
    setTimeout(() => {
        useWorkspaceStore.getState().syncFromServer();
    }, 500);
}
