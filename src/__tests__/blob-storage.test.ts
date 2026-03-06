import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';

// Must mock before import
vi.mock('fs/promises', () => {
    const fns = {
        writeFile: vi.fn(),
        readFile: vi.fn(),
        mkdir: vi.fn(),
    };
    return { ...fns, default: fns };
});

import { storeFile, storeTemplateFile, resolveToBuffer, deleteR2Prefix } from '@/lib/blob-storage';

const CACHE_ROOT = path.join(process.cwd(), '.design-tool-data');

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
});

describe('storeFile (local)', () => {
    it('stores to local filesystem when R2 not configured', async () => {
        const result = await storeFile('uploads', 'test.png', Buffer.from('img'));
        expect(fs.mkdir).toHaveBeenCalledWith(path.join(CACHE_ROOT, 'uploads'), { recursive: true });
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(CACHE_ROOT, 'uploads', 'test.png'),
            expect.any(Buffer),
        );
        expect(result.url).toBe('/api/files/uploads/test.png');
        expect(result.pathname).toBe('uploads/test.png');
    });

    it('works with different storage types', async () => {
        const result = await storeFile('mockups', 'mock.png', Buffer.from('data'));
        expect(result.url).toBe('/api/files/mockups/mock.png');
    });
});

describe('storeTemplateFile (local)', () => {
    it('stores to templates directory', async () => {
        const result = await storeTemplateFile('tpl.png', Buffer.from('tpl'));
        expect(fs.mkdir).toHaveBeenCalledWith(path.join(CACHE_ROOT, 'templates'), { recursive: true });
        expect(result.url).toBe('/api/files/templates/tpl.png');
        expect(result.pathname).toBe('templates/tpl.png');
    });
});

describe('resolveToBuffer', () => {
    it('throws on empty URL', async () => {
        await expect(resolveToBuffer('')).rejects.toThrow('No URL');
    });

    it('reads local file from cache', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('data'));
        const buf = await resolveToBuffer('/api/files/uploads/test.png');
        expect(fs.readFile).toHaveBeenCalledWith(path.join(CACHE_ROOT, 'uploads', 'test.png'));
        expect(buf.toString()).toBe('data');
    });

    it('falls back to public/ when cache miss', async () => {
        vi.mocked(fs.readFile)
            .mockRejectedValueOnce(new Error('ENOENT'))
            .mockResolvedValueOnce(Buffer.from('public-data'));
        const buf = await resolveToBuffer('/api/files/uploads/test.png');
        expect(buf.toString()).toBe('public-data');
    });

    it('rejects invalid paths', async () => {
        await expect(resolveToBuffer('/api/files/badpath')).rejects.toThrow('Invalid path');
    });

    it('fetches remote URLs', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        });
        vi.stubGlobal('fetch', mockFetch);
        const buf = await resolveToBuffer('https://example.com/img.png');
        expect(mockFetch).toHaveBeenCalledWith('https://example.com/img.png');
        expect(buf).toBeInstanceOf(Buffer);
        vi.unstubAllGlobals();
    });
});

describe('deleteR2Prefix', () => {
    it('returns 0 when R2 not configured', async () => {
        const count = await deleteR2Prefix(['uploads/']);
        expect(count).toBe(0);
    });
});
