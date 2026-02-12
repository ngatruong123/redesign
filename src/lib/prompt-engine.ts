import type { StylePreset } from '@/types';

export const DEFAULT_STYLE_PRESETS: StylePreset[] = [
    // — Classic Styles —
    {
        id: 'minimalist',
        name: 'Minimalist',
        prompt: 'Redesign this image in a clean minimalist style with flat colors, simple shapes, generous whitespace, and modern aesthetic. Keep the core concept but simplify.',
        icon: '◻️',
    },
    {
        id: 'vintage',
        name: 'Vintage / Retro',
        prompt: 'Redesign this image in a vintage retro style with aged textures, muted warm color palette, worn edges, distressed look, 70s-80s aesthetic vibe.',
        icon: '📻',
    },
    {
        id: 'watercolor',
        name: 'Watercolor',
        prompt: 'Redesign this image as a beautiful watercolor painting with soft brushstrokes, flowing colors, organic paint bleeding, artistic hand-painted look.',
        icon: '🎨',
    },
    {
        id: 'pop-art',
        name: 'Bold Pop Art',
        prompt: 'Redesign this image in bold pop art style with high contrast, saturated vibrant colors, comic book aesthetic, halftone dots, Andy Warhol inspired.',
        icon: '💥',
    },
    {
        id: 'line-art',
        name: 'Line Art',
        prompt: 'Redesign this image as elegant line art with detailed linework, monochrome or minimal colors, clean vector-like strokes, illustration style.',
        icon: '✏️',
    },
    {
        id: 'grunge',
        name: 'Grunge / Distressed',
        prompt: 'Redesign this image in grunge distressed style with rough textures, paint splatter, raw urban aesthetic, edgy and rebellious feel.',
        icon: '🔥',
    },
    {
        id: 'pastel',
        name: 'Pastel / Soft',
        prompt: 'Redesign this image in soft pastel style with light gentle tones, dreamy gradients, cute aesthetic, kawaii-inspired, calming and feminine feel.',
        icon: '🌸',
    },
    {
        id: 'neon',
        name: 'Neon / Cyberpunk',
        prompt: 'Redesign this image in neon cyberpunk style with glowing neon colors on dark background, electric blue and pink, futuristic sci-fi aesthetic.',
        icon: '⚡',
    },
    {
        id: 'hand-drawn',
        name: 'Hand-drawn Sketch',
        prompt: 'Redesign this image as a hand-drawn sketch with pencil or charcoal texture, organic imperfections, artistic sketchbook feel, authentic hand-made look.',
        icon: '🖊️',
    },
    {
        id: 'geometric',
        name: 'Abstract Geometric',
        prompt: 'Redesign this image in abstract geometric style with shapes, patterns, deconstructed elements, modern art inspired, bold angular composition.',
        icon: '🔷',
    },

    // — Trending 2025/2026 Styles —
    {
        id: 'y2k',
        name: 'Y2K / 2000s',
        prompt: 'Redesign this image in Y2K aesthetic with metallic chrome effects, bubbly shapes, cyber-futuristic elements, pink and silver color palette, early 2000s digital vibe.',
        icon: '💿',
    },
    {
        id: 'cottagecore',
        name: 'Cottagecore',
        prompt: 'Redesign this image in cottagecore aesthetic with soft natural tones, floral patterns, rustic countryside charm, cozy warm atmosphere, hand-crafted organic feel.',
        icon: '🌿',
    },
    {
        id: 'vaporwave',
        name: 'Vaporwave',
        prompt: 'Redesign this image in vaporwave aesthetic with pastel neon pink and cyan, retro 80s-90s digital art, glitch effects, surreal dreamy atmosphere, roman statues and palm trees vibe.',
        icon: '🌴',
    },
    {
        id: 'boho',
        name: 'Boho / Bohemian',
        prompt: 'Redesign this image in bohemian style with earthy warm tones, tribal patterns, mandala elements, free-spirit aesthetic, handcrafted artisan feel.',
        icon: '🪶',
    },
    {
        id: 'japanese-ink',
        name: 'Japanese Ink',
        prompt: 'Redesign this image in traditional Japanese sumi-e ink wash painting style with bold brush strokes, minimalist composition, zen aesthetic, black ink on white with subtle color accents.',
        icon: '🏯',
    },
    {
        id: 'psychedelic',
        name: 'Psychedelic',
        prompt: 'Redesign this image in psychedelic style with swirling patterns, kaleidoscopic colors, trippy optical illusions, 60s-70s counterculture inspired, vibrant and mind-bending.',
        icon: '🍄',
    },
    {
        id: 'sticker',
        name: 'Sticker / Die-Cut',
        prompt: 'Redesign this image as a glossy die-cut sticker with thick white border outline, vibrant saturated colors, cute cartoon style, clean edges perfect for print-on-demand products.',
        icon: '🏷️',
    },
    {
        id: 'risograph',
        name: 'Risograph Print',
        prompt: 'Redesign this image in risograph print style with limited color palette, halftone dots, subtle misregistration, grainy texture, indie zine aesthetic.',
        icon: '🖨️',
    },
    {
        id: 'pixel-art',
        name: 'Pixel Art',
        prompt: 'Redesign this image as pixel art with retro 8-bit or 16-bit game aesthetic, limited color palette, crisp pixel blocks, nostalgic gaming vibe.',
        icon: '👾',
    },
    {
        id: '3d-render',
        name: '3D Render',
        prompt: 'Redesign this image as a 3D rendered scene with soft lighting, clay-like smooth materials, playful depth, modern 3D illustration style, Pixar-inspired quality.',
        icon: '🧊',
    },
    {
        id: 'embroidery',
        name: 'Embroidery',
        prompt: 'Redesign this image as a detailed embroidery pattern with visible thread texture, cross-stitch or satin stitch style, fabric background, handcrafted textile art feel.',
        icon: '🧵',
    },
    {
        id: 'woodcut',
        name: 'Woodcut / Linocut',
        prompt: 'Redesign this image as a woodcut or linocut print with bold carved lines, high contrast black and white, traditional printmaking texture, vintage craft aesthetic.',
        icon: '🪵',
    },
    {
        id: 'art-nouveau',
        name: 'Art Nouveau',
        prompt: 'Redesign this image in Art Nouveau style with ornate flowing curves, organic natural forms, elegant decorative borders, Alphonse Mucha inspired, rich jewel tones.',
        icon: '🦚',
    },
    {
        id: 'anime',
        name: 'Anime / Manga',
        prompt: 'Redesign this image in anime manga style with clean cell-shading, vivid colors, dynamic composition, large expressive elements, Japanese animation aesthetic.',
        icon: '✨',
    },
    {
        id: 'dark-academia',
        name: 'Dark Academia',
        prompt: 'Redesign this image in dark academia aesthetic with moody muted tones, classical art references, leather and parchment textures, scholarly vintage atmosphere, warm sepia undertones.',
        icon: '📚',
    },
];

export function buildVariationPrompt(
    basePrompt: string,
    stylePreset: StylePreset,
    additionalContext?: string
): string {
    const parts = [
        stylePreset.prompt,
        basePrompt ? `Original concept: ${basePrompt}` : '',
        additionalContext || '',
        'High quality, print-ready, clean edges, no text unless part of the original design.',
    ].filter(Boolean);

    return parts.join('. ');
}
