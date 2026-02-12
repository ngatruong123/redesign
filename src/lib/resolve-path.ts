import path from 'path';
import { existsSync } from 'fs';
import { getStorageDir } from './storage';

const allowedDirs = ['uploads', 'variations', 'mockups'] as const;

/**
 * Convert an image URL (e.g. /api/files/uploads/abc.png)
 * to an absolute filesystem path under the cache storage dir.
 * Falls back to public/ for backward compatibility with older files.
 * Returns null if the path is invalid or escapes allowed dirs.
 */
export function resolvePublicPath(imageUrl: string): string | null {
    // Strip /api/files/ prefix if present
    let cleaned = imageUrl.replace(/^\/api\/files\//, '/');
    // Strip leading slashes and path traversal
    cleaned = cleaned.replace(/\.\.\//g, '').replace(/^\/+/, '');

    // Extract dir and filename
    const parts = cleaned.split('/');
    if (parts.length < 2) return null;

    const dir = parts[0];
    if (!allowedDirs.includes(dir as typeof allowedDirs[number])) return null;

    const filename = parts[parts.length - 1];
    if (filename.includes('..')) return null;

    // Try cache dir first (new location)
    const storageDir = getStorageDir(dir as typeof allowedDirs[number]);
    const cachePath = path.join(storageDir, filename);
    if (cachePath.startsWith(storageDir) && existsSync(cachePath)) {
        return cachePath;
    }

    // Fallback to public/ (old location, backward compat)
    const publicDir = path.join(process.cwd(), 'public');
    const publicPath = path.join(publicDir, dir, filename);
    if (publicPath.startsWith(publicDir + path.sep) && existsSync(publicPath)) {
        return publicPath;
    }

    return null;
}
