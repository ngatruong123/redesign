import path from 'path';
import { mkdir, readdir, stat, unlink } from 'fs/promises';

// Store outside .next/ so files survive rebuilds
const CACHE_ROOT = path.join(process.cwd(), '.design-tool-data');

type StorageType = 'uploads' | 'variations' | 'mockups' | 'videos';

export function getStorageDir(type: StorageType): string {
    return path.join(CACHE_ROOT, type);
}

export async function ensureStorageDir(type: StorageType): Promise<string> {
    const dir = getStorageDir(type);
    await mkdir(dir, { recursive: true });
    return dir;
}

export async function cleanupOldFiles(type: StorageType, maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
    const dir = getStorageDir(type);
    let removed = 0;
    try {
        const files = await readdir(dir);
        const now = Date.now();
        for (const file of files) {
            try {
                const filePath = path.join(dir, file);
                const fileStat = await stat(filePath);
                if (now - fileStat.mtimeMs > maxAgeMs) {
                    await unlink(filePath);
                    removed++;
                }
            } catch {
                // skip individual file errors
            }
        }
    } catch {
        // dir doesn't exist yet, nothing to clean
    }
    return removed;
}
