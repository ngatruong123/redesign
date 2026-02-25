import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DesignFile, GeneratedVariation, MockupTemplate, GeneratedMockup, WorkflowStep, VideoGeneration, EtsySEO } from '@/types';

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
            reset: () => set(initialState),
        }),
        {
            name: 'design-tool-workflow',
            partialize: (state) => ({
                currentStep: state.currentStep,
                sourceDesigns: state.sourceDesigns,
                sourceDesign: state.sourceDesign,
                variations: state.variations,
                mockupTemplates: state.mockupTemplates,
                generatedMockups: state.generatedMockups,
            }),
            onRehydrateStorage: () => (state) => {
                if (!state) return;
                // Keep mockupTemplates (with masks) across reloads
                // Clear transient data so user starts fresh with new designs
                state.sourceDesigns = [];
                state.sourceDesign = null;
                state.variations = [];
                state.generatedMockups = [];
                state.currentStep = 'upload';
            },
        }
    )
);
