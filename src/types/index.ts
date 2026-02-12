export interface DesignFile {
    id: string;
    name: string;
    url: string;
    width: number;
    height: number;
    file?: File;
}

export interface StylePreset {
    id: string;
    name: string;
    prompt: string;
    icon: string;
}

export interface GeneratedVariation {
    id: string;
    styleId: string;
    styleName: string;
    imageUrl: string;
    selected: boolean;
    loading: boolean;
}

export interface MockupTemplate {
    id: string;
    name: string;
    imageUrl: string;
    mask: MockupMask | null;
}

export interface MockupMask {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
}

export interface GeneratedMockup {
    id: string;
    templateId?: string;
    variationId?: string;
    templateName: string;
    variationName: string;
    imageUrl: string;
    error?: string;
}

export type WorkflowStep = 'upload' | 'variations' | 'mockup';

export interface AIProviderConfig {
    provider: 'banana-pro' | 'openai' | 'stability' | 'mock';
    apiKey: string;
    modelId?: string;
    baseUrl?: string;
}
