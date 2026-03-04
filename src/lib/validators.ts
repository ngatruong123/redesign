import { z } from 'zod';

// Auth
export const loginSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(6).max(200),
    email: z.string().email().optional(),
});

// Workspace
export const createWorkspaceSchema = z.object({
    name: z.string().min(1).max(200),
    id: z.string().max(100).optional(),
});

export const updateWorkspaceSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    data: z.unknown().optional(),
});

// Generate
const styleSchema = z.object({
    id: z.string(),
    name: z.string(),
    prompt: z.string(),
});

const sourceImageSchema = z.object({
    id: z.string(),
    url: z.string(),
});

export const generateSchema = z.object({
    sourceImageUrl: z.string().optional(),
    sourceImagePath: z.string().optional(),
    styles: z.array(styleSchema).optional(),
    additionalPrompt: z.string().max(2000).optional(),
    count: z.number().int().min(1).max(20).optional(),
});

export const generateStreamSchema = z.object({
    sourceImageUrl: z.string().optional(),
    sourceImageUrls: z.array(sourceImageSchema).max(10).optional(),
    styles: z.array(styleSchema).optional(),
    additionalPrompt: z.string().max(2000).optional(),
    imageSize: z.string().optional(),
    aspectRatio: z.string().optional(),
});

export const generateSeoSchema = z.object({
    imageUrl: z.string().min(1),
    productContext: z.string().max(2000).optional(),
});

// Mockup
const maskSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    rotation: z.number().optional(),
    mode: z.enum(['rect', 'quad']).optional(),
    quad: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    edgeCurves: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    fitMode: z.string().optional(),
    blendMode: z.string().optional(),
    opacity: z.number().optional(),
    shadow: z.object({ blur: z.number(), color: z.string().optional() }).optional(),
    backgroundBlur: z.number().optional(),
});

const batchItemSchema = z.object({
    mockupImagePath: z.string(),
    designImagePath: z.string(),
    mask: maskSchema,
    overlay: z.record(z.string(), z.unknown()).optional(),
    templateName: z.string().optional(),
    variationName: z.string().optional(),
});

export const mockupBatchSchema = z.object({
    items: z.array(batchItemSchema).min(1).max(100),
});

// Upload
export const uploadSchema = z.object({
    maxSize: z.number().optional(),
});

// Remove BG
export const removeBgSchema = z.object({
    imageUrl: z.string().min(1),
    method: z.enum(['auto', 'rembg', 'ai', 'color']).optional(),
    color: z.string().optional(),
    threshold: z.number().min(0).max(100).optional(),
    gradient: z.string().optional(),
});
