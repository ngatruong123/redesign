import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getStorageDir } from '@/lib/storage';

const ALLOWED_DIRS = ['uploads', 'variations', 'mockups'] as const;

// URL format: /api/download/{dir}/{uuid}.{ext}/{desired-filename.ext}
// Example: /api/download/mockups/abc123.png/MyMockup.png
// The last segment is the download filename - browser uses it as the saved filename
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ params: string[] }> }
) {
    const segments = (await params).params;
    // Need at least: dir, file, downloadName
    if (!segments || segments.length < 3) {
        return new Response('Not found', { status: 404 });
    }

    const dir = segments[0];
    if (!ALLOWED_DIRS.includes(dir as typeof ALLOWED_DIRS[number])) {
        return new Response('Forbidden', { status: 403 });
    }

    const filename = segments[1];
    if (filename.includes('..')) return new Response('Forbidden', { status: 403 });

    const downloadName = decodeURIComponent(segments[2]);

    const storageDir = getStorageDir(dir as typeof ALLOWED_DIRS[number]);
    const cachePath = path.join(storageDir, filename);
    const publicPath = path.join(process.cwd(), 'public', dir, filename);

    let filePath: string | null = null;
    if (existsSync(cachePath)) filePath = cachePath;
    else if (existsSync(publicPath)) filePath = publicPath;
    if (!filePath) return new Response('Not found', { status: 404 });

    const buffer = await readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const types: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.zip': 'application/zip',
    };

    return new Response(buffer, {
        headers: {
            'Content-Type': types[ext] || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'no-cache',
        },
    });
}
