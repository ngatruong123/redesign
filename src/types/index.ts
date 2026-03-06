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
    sourceDesignId?: string;
}

export interface DesignOverlayState {
    variationId: string;
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    naturalWidth: number;
    naturalHeight: number;
    // Crop insets as percentage (0-100) from each edge
    cropTop?: number;
    cropRight?: number;
    cropBottom?: number;
    cropLeft?: number;
}

export interface MockupTemplate {
    id: string;
    name: string;
    imageUrl: string;
    mask: MockupMask | null;
    designOverlay?: DesignOverlayState | null;
}

export interface Point { x: number; y: number; }

export interface MockupMask {
    // Legacy rect (backward compat)
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    // Quad mode
    mode: 'rect' | 'quad';
    quad?: [Point, Point, Point, Point]; // [TL, TR, BR, BL]
    // Edge curve control points (quadratic bezier) — [top, right, bottom, left]
    // Each is the control point for that edge's bezier curve.
    // undefined = straight line (control point at midpoint of edge)
    edgeCurves?: [Point, Point, Point, Point];
    // Fit
    fitMode: 'contain' | 'fill'; // contain = keep aspect ratio (default), fill = stretch
    // Blend
    blendMode: 'normal' | 'multiply' | 'overlay' | 'screen' | 'soft-light';
    opacity: number; // 0-100
    shadow?: { blur: number; color: string; };
    backgroundBlur?: number; // 0 = off, 1-20 = blur px
}

export interface EtsySEO {
    title: string;         // max 140 chars (Etsy limit)
    description: string;   // max 10000 chars
    tags: string[];        // max 13 tags, each max 20 chars
    status: 'idle' | 'generating' | 'done' | 'error';
    error?: string;
}

export interface GeneratedMockup {
    id: string;
    templateId?: string;
    variationId?: string;
    templateName: string;
    variationName: string;
    imageUrl: string;
    error?: string;
    seo?: EtsySEO;
}

export type WorkflowStep = 'upload' | 'variations' | 'mockup' | 'video' | 'settings';

export interface VideoGeneration {
    id: string;
    mockupId: string;
    mockupImageUrl: string;
    prompt: string;
    status: 'pending' | 'generating' | 'done' | 'error';
    videoUrl?: string;
    error?: string;
    operationName?: string;
}

export interface AIProviderConfig {
    provider: 'banana-pro' | 'openai' | 'stability' | 'mock';
    apiKey: string;
    modelId?: string;
    baseUrl?: string;
}
