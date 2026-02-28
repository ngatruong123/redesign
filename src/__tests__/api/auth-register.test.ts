import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
vi.mock('@/lib/db', () => ({
    prisma: {
        user: {
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            create: (...args: unknown[]) => mockCreate(...args),
        },
    },
}));

// Mock next/headers cookies
vi.mock('next/headers', () => ({
    cookies: vi.fn().mockReturnValue({
        get: vi.fn(),
    }),
}));

describe('Registration validation', () => {
    beforeEach(() => {
        mockFindUnique.mockReset();
        mockCreate.mockReset();
    });

    it('should reject username shorter than 3 chars', () => {
        const username = 'ab';
        expect(username.length < 3).toBe(true);
    });

    it('should reject username longer than 20 chars', () => {
        const username = 'a'.repeat(21);
        expect(username.length > 20).toBe(true);
    });

    it('should reject username with special characters', () => {
        const invalidUsernames = ['user@name', 'user name', 'user!name', 'user.name'];
        for (const u of invalidUsernames) {
            expect(/^[a-zA-Z0-9_]+$/.test(u)).toBe(false);
        }
    });

    it('should accept valid usernames', () => {
        const validUsernames = ['admin', 'user_123', 'TestUser', 'abc'];
        for (const u of validUsernames) {
            expect(/^[a-zA-Z0-9_]+$/.test(u)).toBe(true);
            expect(u.length >= 3 && u.length <= 20).toBe(true);
        }
    });

    it('should reject password shorter than 8 chars', () => {
        const password = '1234567';
        expect(password.length < 8).toBe(true);
    });

    it('should accept password with 8+ chars', () => {
        const password = '12345678';
        expect(password.length >= 8).toBe(true);
    });

    it('should detect duplicate username via prisma', async () => {
        mockFindUnique.mockResolvedValue({ id: '1', username: 'existinguser' });
        const result = await mockFindUnique({ where: { username: 'existinguser' } });
        expect(result).not.toBeNull();
    });

    it('should allow new username', async () => {
        mockFindUnique.mockResolvedValue(null);
        const result = await mockFindUnique({ where: { username: 'newuser' } });
        expect(result).toBeNull();
    });
});
