import { describe, it, expect, beforeEach } from 'vitest';

// Re-import fresh module for each test suite
let checkRateLimit: typeof import('@/lib/rate-limiter').checkRateLimit;

beforeEach(async () => {
    // Dynamic import to get a fresh module state
    const mod = await import('@/lib/rate-limiter');
    checkRateLimit = mod.checkRateLimit;
});

describe('checkRateLimit', () => {
    it('allows requests within limit', () => {
        const result = checkRateLimit('test-key-1', 3, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.retryAfterMs).toBe(0);
    });

    it('blocks requests exceeding limit', () => {
        const key = 'test-key-2-' + Date.now();
        for (let i = 0; i < 3; i++) {
            checkRateLimit(key, 3, 60_000);
        }
        const result = checkRateLimit(key, 3, 60_000);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('allows requests after window expires', () => {
        const key = 'test-key-3-' + Date.now();
        // Use a very short window
        for (let i = 0; i < 3; i++) {
            checkRateLimit(key, 3, 1); // 1ms window
        }
        // Wait a tiny bit for window to expire
        const start = Date.now();
        while (Date.now() - start < 5) { /* spin */ }
        const result = checkRateLimit(key, 3, 1);
        expect(result.allowed).toBe(true);
    });

    it('returns correct retryAfterMs', () => {
        const key = 'test-key-4-' + Date.now();
        for (let i = 0; i < 5; i++) {
            checkRateLimit(key, 5, 10_000);
        }
        const result = checkRateLimit(key, 5, 10_000);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeLessThanOrEqual(10_000);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('uses different limits per key', () => {
        const keyA = 'key-a-' + Date.now();
        const keyB = 'key-b-' + Date.now();
        checkRateLimit(keyA, 1, 60_000);
        const resultA = checkRateLimit(keyA, 1, 60_000);
        const resultB = checkRateLimit(keyB, 1, 60_000);
        expect(resultA.allowed).toBe(false);
        expect(resultB.allowed).toBe(true);
    });
});
