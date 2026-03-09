import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DesignFile, GeneratedVariation, MockupTemplate, GeneratedMockup, WorkflowStep, VideoGeneration, EtsySEO } from '@/types';
import { getActiveUser, getActiveWorkspaceId, syncTemplatesToServer, syncWorkflowToServer, loadWorkflowFromServer } from './workflow-sync';
import { migrateFromOldKey } from './workflow-migration';

// Run migration before store creation
migrateFromOldKey();

// Guard: don't sync to server until initial load is complete
let _initialLoadDone = false;
function markInitialLoadDone() { _initialLoadDone = true; }

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
                // Templates NOT persisted — server (/api/templates) is source of truth
                // Generated mockups NOT persisted (data URLs too large for localStorage)
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                // Reset transient flags
                state.isGenerating = false;
                state.isCompositing = false;
                state.error = null;

                const wsId = getActiveWorkspaceId();
                console.log('[rehydrate] wsId:', wsId, 'designs:', state.sourceDesigns?.length, 'vars:', state.variations?.length);

                // Collect async loads to wait for before enabling sync
                const pendingLoads: Promise<void>[] = [];

                // Single API call: load workflow data + templates from workspace endpoint
                if (typeof window !== 'undefined') {
                    pendingLoads.push(
                        loadWorkflowFromServer(wsId, (data) => useWorkflowStore.setState(data))
                    );
                }

                // Only enable sync after ALL async loads complete
                if (pendingLoads.length > 0) {
                    Promise.all(pendingLoads).finally(() => { markInitialLoadDone(); });
                } else {
                    markInitialLoadDone();
                }

                // Validate persisted image URLs still exist on server
                // Wait for server load to complete first, and only clear on definitive 404 (not network errors)
                if (typeof window !== 'undefined' && pendingLoads.length > 0) {
                    Promise.all(pendingLoads).then(() => {
                        const currentState = useWorkflowStore.getState();
                        const urlToCheck =
                            currentState.sourceDesigns[0]?.url ||
                            currentState.variations.find((v) => v.imageUrl)?.imageUrl;

                        if (urlToCheck) {
                            fetch(urlToCheck, { method: 'HEAD' })
                                .then((res) => {
                                    if (res.status === 404) {
                                        useWorkflowStore.setState({
                                            currentStep: 'upload',
                                            sourceDesigns: [],
                                            variations: [],
                                            generatedMockups: [],
                                        });
                                    }
                                })
                                .catch(() => {
                                    // Network error — don't clear data, might be transient
                                });
                        }
                    });
                }
            },
        }
    )
);

/**
 * Switch workflow store to a different workspace without page reload.
 * Reads persisted data from the new workspace's localStorage key and sets it.
 */
export function switchWorkflowToWorkspace(newWsId: string) {
    _initialLoadDone = false;
    const user = getActiveUser();
    const key = `design-tool-${user}-ws-${newWsId}`;
    let restored = false;

    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.state) {
                useWorkflowStore.setState({
                    ...initialState,
                    ...parsed.state,
                    mockupTemplates: [], // Templates loaded from server, not localStorage
                    isGenerating: false,
                    isCompositing: false,
                    error: null,
                    generatedMockups: [],
                });
                restored = true;
            }
        }
    } catch { /* ignore */ }

    if (!restored) {
        useWorkflowStore.setState({ ...initialState });
    }

    // Single API call: load workflow data + templates from workspace endpoint
    loadWorkflowFromServer(newWsId, (data) => useWorkflowStore.setState(data))
        .finally(() => { markInitialLoadDone(); });
}

// Subscribe to state changes and sync workflow data to server (debounced)
if (typeof window !== 'undefined') {
    useWorkflowStore.subscribe(
        (state, prevState) => {
            if (!_initialLoadDone) return;
            if (
                state.sourceDesigns !== prevState.sourceDesigns ||
                state.variations !== prevState.variations ||
                state.currentStep !== prevState.currentStep
            ) {
                syncWorkflowToServer(() => useWorkflowStore.getState());
            }
        }
    );
}
