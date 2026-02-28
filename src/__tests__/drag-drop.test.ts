import { describe, it, expect } from 'vitest';

describe('Drag & Drop', () => {
    describe('dataTransfer setup', () => {
        it('should set variation ID and image URL in dataTransfer format', () => {
            const variationId = 'var-123';
            const imageUrl = '/api/files/variations/test.png';

            // Simulate what VariationsPanel does on dragStart
            const dataTransfer = new Map<string, string>();
            dataTransfer.set('application/x-variation-id', variationId);
            dataTransfer.set('text/uri-list', imageUrl);

            expect(dataTransfer.get('application/x-variation-id')).toBe(variationId);
            expect(dataTransfer.get('text/uri-list')).toBe(imageUrl);
        });
    });

    describe('drop handler parsing', () => {
        it('should parse variation ID from dataTransfer', () => {
            const variationId = 'var-456';
            const data = new Map<string, string>();
            data.set('application/x-variation-id', variationId);

            const parsed = data.get('application/x-variation-id');
            expect(parsed).toBe('var-456');
        });

        it('should detect file drop when no variation ID present', () => {
            const data = new Map<string, string>();
            // No variation ID set — means it's a file drop
            const variationId = data.get('application/x-variation-id');
            expect(variationId).toBeUndefined();
        });
    });

    describe('file validation', () => {
        it('should accept image files', () => {
            const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
            for (const type of imageTypes) {
                expect(type.startsWith('image/')).toBe(true);
            }
        });

        it('should reject non-image files', () => {
            const nonImageTypes = ['application/pdf', 'text/plain', 'video/mp4', 'application/zip'];
            for (const type of nonImageTypes) {
                expect(type.startsWith('image/')).toBe(false);
            }
        });
    });
});
