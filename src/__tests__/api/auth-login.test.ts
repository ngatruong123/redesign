import { describe, it, expect, vi } from 'vitest';

// Mock prisma
vi.mock('@/lib/db', () => ({
    prisma: {
        user: {
            findUnique: vi.fn().mockResolvedValue(null), // no DB users, use env fallback
        },
    },
}));

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn().mockReturnValue({
        get: vi.fn(),
    }),
}));

describe('Login', () => {
    it('should succeed with correct credentials', async () => {
        const { checkCredentials } = await import('@/auth');
        const result = await checkCredentials('testuser', 'testpassword123');
        expect(result).toBe(true);
    });

    it('should fail with wrong credentials', async () => {
        const { checkCredentials } = await import('@/auth');
        const result = await checkCredentials('testuser', 'wrongpass');
        expect(result).toBe(false);
    });

    it('should fail with wrong username', async () => {
        const { checkCredentials } = await import('@/auth');
        const result = await checkCredentials('nobody', 'testpassword123');
        expect(result).toBe(false);
    });
});
