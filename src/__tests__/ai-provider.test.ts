import { describe, it, expect, vi } from 'vitest';
import { createAIProvider } from '@/lib/ai-provider';

describe('AIProvider', () => {
    describe('MockProvider', () => {
        it('generateVariation should return valid base64', async () => {
            const provider = createAIProvider('mock');
            const result = await provider.generateVariation('dGVzdA==', 'test prompt');
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
            // Should decode to valid SVG
            const decoded = Buffer.from(result, 'base64').toString('utf-8');
            expect(decoded).toContain('<svg');
            expect(decoded).toContain('AI Variation');
        });

        it('generateMockup should return valid base64', async () => {
            const provider = createAIProvider('mock');
            const result = await provider.generateMockup('dGVzdA==', 'dGVzdA==', 'test prompt');
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
            const decoded = Buffer.from(result, 'base64').toString('utf-8');
            expect(decoded).toContain('<svg');
            expect(decoded).toContain('AI Mockup');
        });
    });

    describe('GeminiProvider', () => {
        it('should throw when API key is not set', async () => {
            const origKey = process.env.GEMINI_API_KEY;
            process.env.GEMINI_API_KEY = '';

            const provider = createAIProvider('gemini');
            await expect(provider.generateVariation('dGVzdA==', 'test')).rejects.toThrow('GEMINI_API_KEY');
            await expect(provider.generateMockup('dGVzdA==', 'dGVzdA==', 'test')).rejects.toThrow('GEMINI_API_KEY');

            process.env.GEMINI_API_KEY = origKey;
        });

        it('should handle API errors gracefully', async () => {
            const origKey = process.env.GEMINI_API_KEY;
            process.env.GEMINI_API_KEY = 'fake-key';

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => 'Bad Request',
            }));

            const provider = createAIProvider('gemini');
            await expect(provider.generateVariation('dGVzdA==', 'test')).rejects.toThrow('Gemini API error (400)');

            vi.unstubAllGlobals();
            process.env.GEMINI_API_KEY = origKey;
        });
    });

    describe('createAIProvider', () => {
        it('should return MockProvider for unknown provider', () => {
            const provider = createAIProvider('unknown');
            expect(provider).toBeDefined();
        });

        it('should return GeminiProvider for "gemini"', () => {
            const provider = createAIProvider('gemini');
            expect(provider).toBeDefined();
        });

        it('should return GeminiProvider for "banana-pro"', () => {
            const provider = createAIProvider('banana-pro');
            expect(provider).toBeDefined();
        });
    });
});
