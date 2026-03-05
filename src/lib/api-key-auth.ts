import { prisma } from '@/lib/db';

export async function validateApiKey(request: Request): Promise<string | null> {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) return null;

    // Hash the key and look up by keyHash
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const record = await prisma.apiKey.findUnique({ where: { keyHash } });
    if (!record) return null;
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    // Update lastUsed
    await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsed: new Date() } });

    return record.userId;
}
