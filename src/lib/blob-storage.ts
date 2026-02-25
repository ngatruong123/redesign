import path from 'path';
import { writeFile, readFile, mkdir } from 'fs/promises';

type StorageType = 'uploads' | 'variations' | 'mockups' | 'videos';

const CACHE_ROOT = path.join(process.cwd(), '.design-tool-data');

function isBlob(): boolean {
    return process.env.STORAGE_PROVIDER?.trim().toLowerCase() === 'blob';
}

function getLocalDir(type: StorageType): string {
    return path.join(CACHE_ROOT, type);
}

export async function storeFile(
    type: StorageType,
    filename: string,
    data: Buffer,
): Promise<{ url: string; pathname: string }> {
    const pathname = `${type}/${filename}`;

    if (isBlob()) {
        const { put } = await import('@vercel/blob');
        const blob = await put(pathname, data, { access: 'public' });
        return { url: blob.url, pathname };
    }

    const dir = getLocalDir(type);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), data);
    return { url: `/api/files/${pathname}`, pathname };
}

export async function resolveToBuffer(url: string): Promise<Buffer> {
    if (!url) throw new Error('No URL provided');

    // Blob URLs (https://*.blob.vercel-storage.com/...)
    if (url.startsWith('http://') || url.startsWith('https://')) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    }

    // Local /api/files/ URLs → resolve to filesystem
    const cleaned = url.replace(/^\/api\/files\//, '').replace(/\.\.\//g, '').replace(/^\/+/, '');
    const parts = cleaned.split('/');
    if (parts.length < 2) throw new Error(`Invalid path: ${url}`);

    const dir = parts[0];
    const filename = parts[parts.length - 1];

    // Try cache dir
    const cachePath = path.join(CACHE_ROOT, dir, filename);
    try {
        return await readFile(cachePath);
    } catch {
        // Fallback to public/
        const publicPath = path.join(process.cwd(), 'public', dir, filename);
        return await readFile(publicPath);
    }
}
