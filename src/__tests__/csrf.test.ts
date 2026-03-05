import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
};

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

import { generateCsrfToken, setCsrfCookie, validateCsrf } from '@/lib/csrf';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('generateCsrfToken', () => {
    it('returns a string', () => {
        const token = generateCsrfToken();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
    });

    it('returns unique tokens', () => {
        const a = generateCsrfToken();
        const b = generateCsrfToken();
        expect(a).not.toBe(b);
    });
});

describe('setCsrfCookie', () => {
    it('sets cookie and returns token', async () => {
        const token = await setCsrfCookie();
        expect(typeof token).toBe('string');
        expect(mockCookieStore.set).toHaveBeenCalledWith(
            'csrf-token',
            token,
            expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/' })
        );
    });
});

describe('validateCsrf', () => {
    it('skips GET requests', async () => {
        const req = new NextRequest('http://localhost:3000/api/test', { method: 'GET' });
        const result = await validateCsrf(req);
        expect(result).toBeNull();
    });

    it('skips HEAD requests', async () => {
        const req = new NextRequest('http://localhost:3000/api/test', { method: 'HEAD' });
        const result = await validateCsrf(req);
        expect(result).toBeNull();
    });

    it('rejects POST without tokens', async () => {
        mockCookieStore.get.mockReturnValue(undefined);
        const req = new NextRequest('http://localhost:3000/api/test', { method: 'POST' });
        const result = await validateCsrf(req);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('rejects POST with mismatched tokens', async () => {
        mockCookieStore.get.mockReturnValue({ value: 'token-a' });
        const req = new NextRequest('http://localhost:3000/api/test', {
            method: 'POST',
            headers: { 'x-csrf-token': 'token-b' },
        });
        const result = await validateCsrf(req);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('allows POST with matching tokens', async () => {
        mockCookieStore.get.mockReturnValue({ value: 'valid-token' });
        const req = new NextRequest('http://localhost:3000/api/test', {
            method: 'POST',
            headers: { 'x-csrf-token': 'valid-token' },
        });
        const result = await validateCsrf(req);
        expect(result).toBeNull();
    });
});
