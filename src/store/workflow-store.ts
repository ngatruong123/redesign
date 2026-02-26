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
        const raw = localStorage.getItem('design-tool-workspaces');
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

interface WorkflowState {
    currentStep: WorkflowStep;
    sourceDesigns: DesignFile[];
    /** @deprecated Use sourceDesigns instead */
    sourceDesign: DesignFile | null;
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
    /** @deprecated Use addSourceDesign instead */
    setSourceDesign: (design: DesignFile | null) => void;
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
    sourceDesign: null as DesignFile | null,
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
                sourceDesign: design, // keep compat: last added
            })),
            removeSourceDesign: (id) => set((state) => {
                const sourceDesigns = state.sourceDesigns.filter((d) => d.id !== id);
                return { sourceDesigns, sourceDesign: sourceDesigns[sourceDesigns.length - 1] || null };
            }),
            clearSourceDesigns: () => set({ sourceDesigns: [], sourceDesign: null }),
            setSourceDesign: (design) => set(design
                ? (state) => ({
                    sourceDesign: design,
                    sourceDesigns: state.sourceDesigns.some((d) => d.id === design.id)
                        ? state.sourceDesigns.map((d) => d.id === design.id ? design : d)
                        : [...state.sourceDesigns, design],
                })
                : { sourceDesign: null, sourceDesigns: [] }),
            setVariations: (variations) => set({ variations }),

            toggleVariationSelection: (id) =>
                set((state) => ({
                    variations: state.variations.map((v) =>
                        v.id === id ? { ...v, selected: !v.selected } : v
                    ),
                })),

            selectAllVariations: () =>
                set((state) => ({
                    variations: state.variations.map((v) => ({ ...v, selected: true })),
                })),

            deselectAllVariations: () =>
                set((state) => ({
                    variations: state.variations.map((v) => ({ ...v, selected: false })),
                })),

            updateVariation: (id, update) =>
                set((state) => ({
                    variations: state.variations.map((v) =>
                        v.id === id ? { ...v, ...update } : v
                    ),
                })),

            addMockupTemplate: (template) =>
                set((state) => ({
                    mockupTemplates: [...state.mockupTemplates, template],
                })),

            removeMockupTemplate: (id) =>
                set((state) => ({
                    mockupTemplates: state.mockupTemplates.filter((t) => t.id !== id),
                })),

            updateMockupTemplate: (id, update) =>
                set((state) => ({
                    mockupTemplates: state.mockupTemplates.map((t) =>
                        t.id === id ? { ...t, ...update } : t
                    ),
                })),

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
                    sourceDesign: null,
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
                sourceDesign: state.sourceDesign ? (({ file, ...rest }) => rest)(state.sourceDesign) : null,
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
                                        sourceDesign: null,
                                        variations: [],
                                        generatedMockups: [],
                                    });
                                }
                            })
                            .catch(() => {
                                useWorkflowStore.setState({
                                    currentStep: 'upload',
                                    sourceDesigns: [],
                                    sourceDesign: null,
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
