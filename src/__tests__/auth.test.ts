import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock prisma
vi.mock('@/lib/db', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
    },
}));

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn(),
}));

describe('Auth', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    describe('checkCredentials', () => {
        it('should authenticate with correct env-based credentials', async () => {
            const { prisma } = await import('@/lib/db');
            (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

            const { checkCredentials } = await import('@/auth');
            const result = await checkCredentials('testuser', 'testpassword123');
            expect(result).toBe(true);
        });

        it('should reject wrong password with env-based auth', async () => {
            const { prisma } = await import('@/lib/db');
            (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

            const { checkCredentials } = await import('@/auth');
            const result = await checkCredentials('testuser', 'wrongpassword');
            expect(result).toBe(false);
        });

        it('should reject wrong username', async () => {
            const { prisma } = await import('@/lib/db');
            (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

            const { checkCredentials } = await import('@/auth');
            const result = await checkCredentials('wronguser', 'testpassword123');
            expect(result).toBe(false);
        });

        it('should authenticate against DB user with bcrypt', async () => {
            const hashedPassword = await bcrypt.hash('dbpassword', 10);
            const { prisma } = await import('@/lib/db');
            (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
                id: '1',
                username: 'dbuser',
                password: hashedPassword,
            });

            const { checkCredentials } = await import('@/auth');
            const result = await checkCredentials('dbuser', 'dbpassword');
            expect(result).toBe(true);
        });

        it('should reject wrong password for DB user', async () => {
            const hashedPassword = await bcrypt.hash('dbpassword', 10);
            const { prisma } = await import('@/lib/db');
            (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
                id: '1',
                username: 'dbuser',
                password: hashedPassword,
            });

            const { checkCredentials } = await import('@/auth');
            const result = await checkCredentials('dbuser', 'wrongpassword');
            expect(result).toBe(false);
        });

        it('should fallback to env auth when DB throws', async () => {
            const { prisma } = await import('@/lib/db');
            (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

            const { checkCredentials } = await import('@/auth');
            const result = await checkCredentials('testuser', 'testpassword123');
            expect(result).toBe(true);
        });
    });

    describe('bcrypt', () => {
        it('should verify bcrypt hash correctly', async () => {
            const password = 'mypassword123';
            const hash = await bcrypt.hash(password, 10);
            expect(await bcrypt.compare(password, hash)).toBe(true);
            expect(await bcrypt.compare('wrong', hash)).toBe(false);
        });
    });
});
