import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DesignFile, GeneratedVariation, MockupTemplate, GeneratedMockup, WorkflowStep, VideoGeneration, EtsySEO } from '@/types';

function getActiveUser(): string {
    if (typeof window === 'undefined') return 'default';
    return localStorage.getItem('design-tool-user') || 'default';
}

function getActiveWorkspaceId(): string {
    if (typeof window === 'undefined') return 'default';
    try {
        const raw = localStorage.getItem(`design-tool-${getActiveUser()}-workspaces`);
        if (raw) {
            const parsed = JSON.parse(raw);
            return parsed?.state?.activeId || 'default';
        }
    } catch { /* ignore */ }
    return 'default';
}

/** Migrate data from old persist key to new workspace-based key (one-time) */
function migrateFromOldKey(): void {
    if (typeof window === 'undefined') return;
    const OLD_KEY = 'design-tool-workflow';
    const newKey = `design-tool-${getActiveUser()}-ws-${getActiveWorkspaceId()}`;
    try {
        const oldRaw = localStorage.getItem(OLD_KEY);
        if (!oldRaw) return;
        const newRaw = localStorage.getItem(newKey);
        // Only migrate if new key is empty or has no mockupTemplates
        if (!newRaw || !JSON.parse(newRaw)?.state?.mockupTemplates?.length) {
            const oldData = JSON.parse(oldRaw);
            if (oldData?.state?.mockupTemplates?.length) {
                // Merge old templates into new key
                const newData = newRaw ? JSON.parse(newRaw) : { state: {}, version: 0 };
                newData.state = { ...newData.state, mockupTemplates: oldData.state.mockupTemplates };
                localStorage.setItem(newKey, JSON.stringify(newData));
            }
        }
        // Remove old key after migration
        localStorage.removeItem(OLD_KEY);
    } catch { /* ignore */ }
}

// Run migration before store creation
migrateFromOldKey();

/** Sync current templates to server (scoped by workspace) */
function syncTemplatesToServer(templates: MockupTemplate[]) {
    const wsId = getActiveWorkspaceId();
    fetch(`/api/templates?workspace=${encodeURIComponent(wsId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templates),
    }).catch(() => {});
}

/** Debounced sync of workflow data to server via workspace `data` field */
let syncTimer: ReturnType<typeof setTimeout> | null = null;
function syncWorkflowToServer() {
    if (typeof window === 'undefined') return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        const wsId = getActiveWorkspaceId();
        // Don't sync if no active workspace in DB
        if (!wsId) return;
        const state = useWorkflowStore.getState();
        const data = {
            currentStep: state.currentStep,
            sourceDesigns: state.sourceDesigns.map(({ file, ...rest }) => rest),
            variations: state.variations,
            mockupTemplates: state.mockupTemplates,
        };
        // Ensure workspace exists in DB (handles "default" workspace)
        ensureWorkspaceExists(wsId).then(() => {
            fetch(`/api/workspaces/${encodeURIComponent(wsId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
            }).catch(() => {});
        });
    }, 2000);
}

/** Ensure a workspace exists in DB (creates it if missing, e.g. "default") */
const ensuredWorkspaces = new Set<string>();
async function ensureWorkspaceExists(wsId: string) {
    if (ensuredWorkspaces.has(wsId)) return;
    try {
        const res = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}`);
        if (res.ok) {
            ensuredWorkspaces.add(wsId);
            return;
        }
        // Create it
        const createRes = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: wsId, name: wsId === 'default' ? 'Default' : wsId }),
        });
        if (createRes.ok) ensuredWorkspaces.add(wsId);
    } catch { /* ignore */ }
}

/** Load workflow data from server when localStorage is empty */
async function loadWorkflowFromServer() {
    if (typeof window === 'undefined') return;
    const wsId = getActiveWorkspaceId();
    if (!wsId) return;
    try {
        const res = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}`);
        if (!res.ok) return;
        const workspace = await res.json();
        if (!workspace.data) return;
        const data = typeof workspace.data === 'string' ? JSON.parse(workspace.data) : workspace.data;
        if (data && (data.sourceDesigns?.length || data.variations?.length || data.mockupTemplates?.length)) {
            useWorkflowStore.setState({
                currentStep: data.currentStep || 'upload',
                sourceDesigns: data.sourceDesigns || [],
                variations: data.variations || [],
                mockupTemplates: data.mockupTemplates || [],
            });
        }
    } catch { /* ignore */ }
}

interface WorkflowState {
    currentStep: WorkflowStep;
    sourceDesigns: DesignFile[];
    variations: GeneratedVariation[];
    mockupTemplates: MockupTemplate[];
    generatedMockups: GeneratedMockup[];
    isGenerating: boolean;
    isCompositing: boolean;
    error: string | null;
    videoGeneration: VideoGeneration | null;

    setStep: (step: WorkflowStep) => void;
    addSourceDesign: (design: DesignFile) => void;
    removeSourceDesign: (id: string) => void;
    clearSourceDesigns: () => void;
    setVariations: (variations: GeneratedVariation[]) => void;
    toggleVariationSelection: (id: string) => void;
    selectAllVariations: () => void;
    deselectAllVariations: () => void;
    updateVariation: (id: string, update: Partial<GeneratedVariation>) => void;
    addMockupTemplate: (template: MockupTemplate) => void;
    removeMockupTemplate: (id: string) => void;
    updateMockupTemplate: (id: string, update: Partial<MockupTemplate>) => void;
    setGeneratedMockups: (mockups: GeneratedMockup[]) => void;
    updateMockupSEO: (mockupId: string, seo: Partial<EtsySEO>) => void;
    setIsGenerating: (v: boolean) => void;
    setIsCompositing: (v: boolean) => void;
    setError: (error: string | null) => void;
    setVideoGeneration: (v: VideoGeneration | null) => void;
    clearVideoGeneration: () => void;
    /** Clear all data except mockup templates/masks and delete server files */
    startNewDesign: () => void;
    reset: () => void;
}

const initialState = {
    currentStep: 'upload' as WorkflowStep,
    sourceDesigns: [] as DesignFile[],

    variations: [] as GeneratedVariation[],
    mockupTemplates: [] as MockupTemplate[],
    generatedMockups: [] as GeneratedMockup[],
    isGenerating: false,
    isCompositing: false,
    error: null as string | null,
    videoGeneration: null as VideoGeneration | null,
};

export const useWorkflowStore = create<WorkflowState>()(
    persist(
        (set) => ({
            ...initialState,

            setStep: (step) => set({ currentStep: step }),
            addSourceDesign: (design) => set((state) => ({
                sourceDesigns: [...state.sourceDesigns, design],
            })),
            removeSourceDesign: (id) => set((state) => {
                const sourceDesigns = state.sourceDesigns.filter((d) => d.id !== id);
                return { sourceDesigns };
            }),
            clearSourceDesigns: () => set({ sourceDesigns: [] }),
            setVariations: (variations) => set({ variations }),

            toggleVariationSelection: (id) =>
                set((state) => {
                    const variation = state.variations.find(v => v.id === id);
                    const willDeselect = variation?.selected;
                    return {
                        variations: state.variations.map((v) =>
                            v.id === id ? { ...v, selected: !v.selected } : v
                        ),
                        // Clear overlay from templates that use this variation when deselected
                        ...(willDeselect ? {
                            mockupTemplates: state.mockupTemplates.map((t) =>
                                t.designOverlay?.variationId === id
                                    ? { ...t, designOverlay: null }
                                    : t
                            ),
                        } : {}),
                    };
                }),

            selectAllVariations: () =>
                set((state) => ({
                    variations: state.variations.map((v) => ({ ...v, selected: v.imageUrl ? true : false })),
                })),

            deselectAllVariations: () =>
                set((state) => ({
                    variations: state.variations.map((v) => ({ ...v, selected: false })),
                    mockupTemplates: state.mockupTemplates.map((t) =>
                        t.designOverlay ? { ...t, designOverlay: null } : t
                    ),
                })),

            updateVariation: (id, update) =>
                set((state) => ({
                    variations: state.variations.map((v) =>
                        v.id === id ? { ...v, ...update } : v
                    ),
                })),

            addMockupTemplate: (template) => {
                set((state) => ({
                    mockupTemplates: [...state.mockupTemplates, template],
                }));
                syncTemplatesToServer(useWorkflowStore.getState().mockupTemplates);
            },

            removeMockupTemplate: (id) => {
                set((state) => ({
                    mockupTemplates: state.mockupTemplates.filter((t) => t.id !== id),
                }));
                syncTemplatesToServer(useWorkflowStore.getState().mockupTemplates);
            },

            updateMockupTemplate: (id, update) => {
                set((state) => ({
                    mockupTemplates: state.mockupTemplates.map((t) =>
                        t.id === id ? { ...t, ...update } : t
                    ),
                }));
                syncTemplatesToServer(useWorkflowStore.getState().mockupTemplates);
            },

            setGeneratedMockups: (mockups) => set({ generatedMockups: mockups }),
            updateMockupSEO: (mockupId, seoUpdate) => set((state) => ({
                generatedMockups: state.generatedMockups.map((m) =>
                    m.id === mockupId ? { ...m, seo: { ...(m.seo || { title: '', description: '', tags: [], status: 'idle' as const }), ...seoUpdate } } : m
                ),
            })),
            setIsGenerating: (v) => set({ isGenerating: v }),
            setIsCompositing: (v) => set({ isCompositing: v }),
            setError: (error) => set({ error }),
            setVideoGeneration: (v) => set({ videoGeneration: v }),
            clearVideoGeneration: () => set({ videoGeneration: null }),
            startNewDesign: () => {
                set({
                    currentStep: 'upload',
                    sourceDesigns: [],
                    variations: [],
                    generatedMockups: [],
                    isGenerating: false,
                    isCompositing: false,
                    error: null,
                    videoGeneration: null,
                    // mockupTemplates preserved
                });
                // Clean up server files (uploads, variations, mockups, videos) — keep templates
                fetch('/api/cleanup', { method: 'POST' }).catch(() => {});
            },
            reset: () => set(initialState),
        }),
        {
            name: `design-tool-${getActiveUser()}-ws-${getActiveWorkspaceId()}`,
            partialize: (state) => ({
                currentStep: state.currentStep,
                // Strip non-serializable File objects
                sourceDesigns: state.sourceDesigns.map(({ file, ...rest }) => rest),

                variations: state.variations,
                mockupTemplates: state.mockupTemplates,
                // Don't persist generated mockups (data URLs are too large for localStorage)
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                // Reset transient flags
                state.isGenerating = false;
                state.isCompositing = false;
                state.error = null;

                const isEmpty = !state.sourceDesigns?.length && !state.variations?.length && !state.mockupTemplates?.length;

                // If localStorage has no workflow data, try loading from server
                if (typeof window !== 'undefined' && isEmpty) {
                    loadWorkflowFromServer();
                }

                // Load templates from server if localStorage has none
                if (typeof window !== 'undefined' && (!state.mockupTemplates || state.mockupTemplates.length === 0)) {
                    fetch(`/api/templates?workspace=${encodeURIComponent(getActiveWorkspaceId())}`)
                        .then((res) => res.ok ? res.json() : [])
                        .then((templates) => {
                            if (Array.isArray(templates) && templates.length > 0) {
                                useWorkflowStore.setState({ mockupTemplates: templates });
                            }
                        })
                        .catch(() => {});
                }

                // Validate persisted image URLs still exist on server
                if (typeof window !== 'undefined') {
                    // Pick the first available URL to check
                    const urlToCheck =
                        state.sourceDesigns[0]?.url ||
                        state.variations.find((v) => v.imageUrl)?.imageUrl ||
                        state.generatedMockups.find((m) => m.imageUrl)?.imageUrl;

                    if (urlToCheck) {
                        fetch(urlToCheck, { method: 'HEAD' })
                            .then((res) => {
                                if (!res.ok) {
                                    // Files are gone — clear work data, keep templates
                                    useWorkflowStore.setState({
                                        currentStep: 'upload',
                                        sourceDesigns: [],
    
                                        variations: [],
                                        generatedMockups: [],
                                    });
                                }
                            })
                            .catch(() => {
                                useWorkflowStore.setState({
                                    currentStep: 'upload',
                                    sourceDesigns: [],

                                    variations: [],
                                    generatedMockups: [],
                                });
                            });
                    }
                }
            },
        }
    )
);

// Subscribe to state changes and sync workflow data to server (debounced)
if (typeof window !== 'undefined') {
    useWorkflowStore.subscribe(
        (state, prevState) => {
            // Only sync when relevant data changes
            if (
                state.sourceDesigns !== prevState.sourceDesigns ||
                state.variations !== prevState.variations ||
                state.mockupTemplates !== prevState.mockupTemplates ||
                state.currentStep !== prevState.currentStep
            ) {
                syncWorkflowToServer();
            }
        }
    );
}
