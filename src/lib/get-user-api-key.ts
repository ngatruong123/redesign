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

        // Non-sensitive keys (like ai_provider) are stored as plain text
        const SENSITIVE_KEYS = ['gemini_api_key', 'ideogram_api_key'];
        if (SENSITIVE_KEYS.includes(settingKey)) {
            return decrypt(setting.value);
        }
        return setting.value;
    } catch (err) {
        console.warn(`[getUserApiKey] Failed to get ${settingKey}:`, err);
        return null;
    }
}
