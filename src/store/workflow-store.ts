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
                // On reload: clear everything, start fresh
                state.sourceDesign = null;
                state.variations = [];
                state.mockupTemplates = [];
                state.generatedMockups = [];
                state.currentStep = 'upload';
            },
        }
    )
);
