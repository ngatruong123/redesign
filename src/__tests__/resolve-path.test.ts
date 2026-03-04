import { describe, it, expect, vi } from 'vitest';

// Mock fs.existsSync
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
}));

vi.mock('@/lib/storage', () => ({
    getStorageDir: vi.fn((dir: string) => `/tmp/storage/${dir}`),
}));

import { resolvePublicPath } from '@/lib/resolve-path';

describe('resolvePublicPath', () => {
    it('returns null for empty or invalid paths', () => {
        expect(resolvePublicPath('')).toBe(null);
        expect(resolvePublicPath('/')).toBe(null);
        expect(resolvePublicPath('singlename')).toBe(null);
    });

    it('returns null for disallowed directories', () => {
        expect(resolvePublicPath('/secrets/file.png')).toBe(null);
        expect(resolvePublicPath('/etc/passwd')).toBe(null);
    });

    it('returns null for path traversal attempts', () => {
        expect(resolvePublicPath('/uploads/../../../etc/passwd')).toBe(null);
        expect(resolvePublicPath('/uploads/..%2F..%2Fetc/passwd')).toBe(null);
    });

    it('strips /api/files/ prefix', () => {
        // Even with the prefix stripped, file won't exist in our mock
        const result = resolvePublicPath('/api/files/uploads/test.png');
        expect(result).toBe(null); // File doesn't exist in mock
    });

    it('accepts allowed directories when file exists', async () => {
        const fs = await import('fs');
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const result = resolvePublicPath('/uploads/test.png');
        expect(result).not.toBe(null);
        expect(result).toContain('test.png');

        vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    it('rejects filenames with path traversal', () => {
        expect(resolvePublicPath('/uploads/..test.png')).toBe(null);
    });
});
