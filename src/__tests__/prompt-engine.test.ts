import { describe, it, expect } from 'vitest';
import { buildMockupPrompt, buildVariationPrompt, DEFAULT_STYLE_PRESETS } from '@/lib/prompt-engine';

describe('buildMockupPrompt', () => {
    it('should contain key mockup instructions', () => {
        const prompt = buildMockupPrompt();
        expect(prompt).toContain('mockup template');
        expect(prompt).toContain('perspective');
        expect(prompt).toContain('lighting');
        expect(prompt).toContain('photorealistic');
    });

    it('should include template name when provided', () => {
        const prompt = buildMockupPrompt('Black T-Shirt');
        expect(prompt).toContain('Black T-Shirt');
    });

    it('should include design description when provided', () => {
        const prompt = buildMockupPrompt(undefined, 'Floral watercolor pattern');
        expect(prompt).toContain('Floral watercolor pattern');
    });

    it('should append custom instructions', () => {
        const prompt = buildMockupPrompt('Mug', 'Logo', 'make it look vintage');
        expect(prompt).toContain('make it look vintage');
        expect(prompt).toContain('ADDITIONAL INSTRUCTIONS');
    });

    it('should work with no arguments', () => {
        const prompt = buildMockupPrompt();
        expect(prompt.length).toBeGreaterThan(50);
    });
});

describe('buildVariationPrompt', () => {
    it('should include style name and prompt', () => {
        const preset = DEFAULT_STYLE_PRESETS[0]; // Minimalist
        const result = buildVariationPrompt('', preset);
        expect(result).toContain('MINIMALIST');
        expect(result).toContain(preset.prompt);
    });

    it('should prioritize user request', () => {
        const preset = DEFAULT_STYLE_PRESETS[0];
        const result = buildVariationPrompt('Make it blue', preset);
        expect(result).toContain('HIGHEST PRIORITY');
        expect(result).toContain('Make it blue');
    });

    it('should handle custom preset mode', () => {
        const customPreset = { id: 'custom-1', name: 'Custom', prompt: 'Do something special', icon: '🎯' };
        const result = buildVariationPrompt('', customPreset);
        expect(result).toContain('Do something special');
        expect(result).not.toContain('HIGHEST PRIORITY');
    });

    it('should include additional context', () => {
        const preset = DEFAULT_STYLE_PRESETS[0];
        const result = buildVariationPrompt('', preset, 'Extra context here');
        expect(result).toContain('Extra context here');
    });
});
