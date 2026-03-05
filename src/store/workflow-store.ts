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

                // Collect async loads to wait for before enabling sync
                const pendingLoads: Promise<void>[] = [];

                // If localStorage has no workflow data, try loading from server
                if (typeof window !== 'undefined' && isEmpty) {
                    const wsId = getActiveWorkspaceId();
                    pendingLoads.push(
                        loadWorkflowFromServer(wsId, (data) => useWorkflowStore.setState(data))
                    );
                }

                // Load templates from server if localStorage has none
                if (typeof window !== 'undefined' && (!state.mockupTemplates || state.mockupTemplates.length === 0)) {
                    pendingLoads.push(
                        fetch(`/api/templates?workspace=${encodeURIComponent(getActiveWorkspaceId())}`)
                            .then((res) => res.ok ? res.json() : [])
                            .then((templates) => {
                                if (Array.isArray(templates) && templates.length > 0) {
                                    useWorkflowStore.setState({ mockupTemplates: templates });
                                }
                            })
                            .catch(() => {})
                    );
                }

                // Only enable sync after ALL async loads complete
                if (pendingLoads.length > 0) {
                    Promise.all(pendingLoads).finally(() => { markInitialLoadDone(); });
                } else {
                    markInitialLoadDone();
                }

                // Validate persisted image URLs still exist on server
                if (typeof window !== 'undefined') {
                    const urlToCheck =
                        state.sourceDesigns[0]?.url ||
                        state.variations.find((v) => v.imageUrl)?.imageUrl ||
                        state.generatedMockups.find((m) => m.imageUrl)?.imageUrl;

                    if (urlToCheck) {
                        fetch(urlToCheck, { method: 'HEAD' })
                            .then((res) => {
                                if (!res.ok) {
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
            if (!_initialLoadDone) return;
            if (
                state.sourceDesigns !== prevState.sourceDesigns ||
                state.variations !== prevState.variations ||
                state.mockupTemplates !== prevState.mockupTemplates ||
                state.currentStep !== prevState.currentStep
            ) {
                syncWorkflowToServer(() => useWorkflowStore.getState());
            }
        }
    );
}
