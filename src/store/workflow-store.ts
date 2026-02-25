import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DesignFile, GeneratedVariation, MockupTemplate, GeneratedMockup, WorkflowStep, VideoGeneration } from '@/types';

interface WorkflowState {
    currentStep: WorkflowStep;
    sourceDesign: DesignFile | null;
    variations: GeneratedVariation[];
    mockupTemplates: MockupTemplate[];
    generatedMockups: GeneratedMockup[];
    isGenerating: boolean;
    isCompositing: boolean;
    error: string | null;
    videoGeneration: VideoGeneration | null;

    setStep: (step: WorkflowStep) => void;
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
    setIsGenerating: (v: boolean) => void;
    setIsCompositing: (v: boolean) => void;
    setError: (error: string | null) => void;
    setVideoGeneration: (v: VideoGeneration | null) => void;
    clearVideoGeneration: () => void;
    reset: () => void;
}

const initialState = {
    currentStep: 'upload' as WorkflowStep,
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
            setSourceDesign: (design) => set({ sourceDesign: design }),
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
            setIsGenerating: (v) => set({ isGenerating: v }),
            setIsCompositing: (v) => set({ isCompositing: v }),
            setError: (error) => set({ error }),
            setVideoGeneration: (v) => set({ videoGeneration: v }),
            clearVideoGeneration: () => set({ videoGeneration: null }),
            reset: () => set(initialState),
        }),
        {
            name: 'design-tool-workflow',
            partialize: (state) => ({
                currentStep: state.currentStep,
                sourceDesign: state.sourceDesign,
                variations: state.variations,
                mockupTemplates: state.mockupTemplates,
                generatedMockups: state.generatedMockups,
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                const isValidUrl = (url: string) =>
                    url.startsWith('/api/files/') || url.startsWith('https://');
                // Validate persisted file URLs format
                if (state.sourceDesign && !isValidUrl(state.sourceDesign.url)) {
                    state.sourceDesign = null;
                    state.currentStep = 'upload';
                }
                state.variations = state.variations.filter(
                    (v) => !v.imageUrl || isValidUrl(v.imageUrl)
                );
                state.generatedMockups = (state.generatedMockups || []).filter(
                    (m) => !m.imageUrl || isValidUrl(m.imageUrl)
                );
                // Async validate that files actually exist on server
                const checkUrl = (url: string) => fetch(url, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
                (async () => {
                    // Validate source design
                    if (state.sourceDesign) {
                        const ok = await checkUrl(state.sourceDesign.url);
                        if (!ok) {
                            useWorkflowStore.setState({ sourceDesign: null, currentStep: 'upload', variations: [], mockupTemplates: [], generatedMockups: [] });
                            return;
                        }
                    }
                    // Validate variations
                    if (state.variations.length > 0) {
                        const checks = await Promise.all(state.variations.map(v => v.imageUrl ? checkUrl(v.imageUrl) : Promise.resolve(false)));
                        const valid = state.variations.filter((_, i) => checks[i]);
                        if (valid.length !== state.variations.length) {
                            useWorkflowStore.setState({ variations: valid });
                        }
                    }
                    // Validate mockup templates
                    if (state.mockupTemplates.length > 0) {
                        const checks = await Promise.all(state.mockupTemplates.map(t => t.imageUrl ? checkUrl(t.imageUrl) : Promise.resolve(false)));
                        const valid = state.mockupTemplates.filter((_, i) => checks[i]);
                        if (valid.length !== state.mockupTemplates.length) {
                            useWorkflowStore.setState({ mockupTemplates: valid });
                        }
                    }
                    // Validate generated mockups
                    if (state.generatedMockups?.length > 0) {
                        const checks = await Promise.all(state.generatedMockups.map(m => m.imageUrl ? checkUrl(m.imageUrl) : Promise.resolve(false)));
                        const valid = state.generatedMockups.filter((_, i) => checks[i]);
                        if (valid.length !== state.generatedMockups.length) {
                            useWorkflowStore.setState({ generatedMockups: valid });
                        }
                    }
                })();
            },
        }
    )
);
