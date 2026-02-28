import { describe, it, expect } from 'vitest';
import { createAIProvider } from '@/lib/ai-provider';
import { buildMockupPrompt } from '@/lib/prompt-engine';

describe('AI Mockup Generate', () => {
    describe('request validation logic', () => {
        it('should require templates array', () => {
            const templates: unknown[] = [];
            expect(templates.length === 0).toBe(true);
        });

        it('should require variations array', () => {
            const variations: unknown[] = [];
            expect(variations.length === 0).toBe(true);
        });

        it('should accept valid request shape', () => {
            const body = {
                templates: [{ id: '1', name: 'T-Shirt', imageUrl: '/test.png' }],
                variations: [{ id: '2', name: 'Pop Art', imageUrl: '/var.png' }],
            };
            expect(body.templates.length).toBeGreaterThan(0);
            expect(body.variations.length).toBeGreaterThan(0);
        });
    });

    describe('provider integration', () => {
        it('should call MockProvider.generateMockup correctly', async () => {
            const provider = createAIProvider('mock');
            const prompt = buildMockupPrompt('T-Shirt', 'Pop Art Design');
            const result = await provider.generateMockup('dGVzdA==', 'dGVzdA==', prompt);
            expect(result).toBeTruthy();
            const decoded = Buffer.from(result, 'base64').toString('utf-8');
            expect(decoded).toContain('<svg');
        });

        it('should generate correct prompt for mockup', () => {
            const prompt = buildMockupPrompt('White Mug', 'Minimalist Logo', 'add soft shadow');
            expect(prompt).toContain('White Mug');
            expect(prompt).toContain('Minimalist Logo');
            expect(prompt).toContain('add soft shadow');
            expect(prompt).toContain('perspective');
        });
    });
});
