import { z } from 'zod';

// Auth
export const loginSchema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
    username: z.string().min(3, 'Username phải từ 3-20 ký tự').max(20, 'Username phải từ 3-20 ký tự').regex(/^[a-zA-Z0-9_]+$/, 'Username chỉ được chứa chữ, số và _'),
    password: z.string().min(8, 'Mật khẩu phải ít nhất 8 ký tự').max(200),
    email: z.string().email('Email không hợp lệ').optional(),
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
    imageSize: z.enum(['512px', '1K', '2K', '4K']).optional(),
    aspectRatio: z.enum(['1:1', '1:4', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']).optional(),
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
    mode: z.enum(['transparent', 'color', 'gradient', 'custom', 'colorkey', 'ai-colorkey']).optional(),
    method: z.enum(['auto', 'rembg', 'ai', 'color']).optional(),
    bgColor: z.string().optional(),
    gradientId: z.string().optional(),
    customBgUrl: z.string().optional(),
    edgeSmooth: z.boolean().optional(),
    keyColor: z.string().optional(),
    keyColors: z.array(z.string()).max(20).optional(),
    tolerance: z.number().min(0).max(100).optional(),
    softEdge: z.number().min(0).max(100).optional(),
    color: z.string().optional(),
    threshold: z.number().min(0).max(100).optional(),
    gradient: z.string().optional(),
});
