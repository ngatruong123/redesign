import { getAuthUsername } from '@/auth';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';

/**
 * Get the user's custom API key for a given provider.
 * Returns the decrypted key or null if not set.
 */
export async function getUserApiKey(settingKey: string = 'gemini_api_key'): Promise<string | null> {
    try {
        const username = await getAuthUsername();
        if (!username) return null;

        const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
        if (!user) return null;

        const setting = await prisma.userSetting.findUnique({
            where: { userId_key: { userId: user.id, key: settingKey } },
        });
        if (!setting) return null;

        return decrypt(setting.value);
    } catch (err) {
        console.warn(`[getUserApiKey] Failed to get ${settingKey}:`, err);
        return null;
    }
}
