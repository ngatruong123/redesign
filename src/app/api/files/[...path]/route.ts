import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getStorageDir } from '@/lib/storage';

const ALLOWED_DIRS = ['uploads', 'variations', 'mockups', 'videos', 'templates'] as const;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const segments = (await params).path;
        if (!segments || segments.length < 2) {
            return new Response('Not found', { status: 404 });
        }

        const dir = segments[0];
        if (!ALLOWED_DIRS.includes(dir as typeof ALLOWED_DIRS[number])) {
            return new Response('Forbidden', { status: 403 });
        }

        const filename = segments[segments.length - 1];
        // Block path traversal
        if (filename.includes('..') || filename.includes('/')) {
            return new Response('Forbidden', { status: 403 });
        }

        // Try cache dir first, then fallback to public/
        const storageDir = getStorageDir(dir as typeof ALLOWED_DIRS[number]);
        const cachePath = path.join(storageDir, filename);
        const publicPath = path.join(process.cwd(), 'public', dir, filename);

        let filePath: string;
        if (cachePath.startsWith(storageDir) && existsSync(cachePath)) {
            filePath = cachePath;
        } else if (publicPath.startsWith(path.join(process.cwd(), 'public')) && existsSync(publicPath)) {
            filePath = publicPath;
        } else {
            return new Response('Not found', { status: 404 });
        }

        const buffer = await readFile(filePath);

        const ext = path.extname(filename).toLowerCase();
        const contentTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.zip': 'application/zip',
            '.mp4': 'video/mp4',
        };

        const headers: Record<string, string> = {
            'Content-Type': contentTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(buffer.length),
        };

        // Support download via ?dl=filename query param
        const dl = request.nextUrl.searchParams.get('dl');
        if (dl) {
            headers['Content-Disposition'] = `attachment; filename="${dl}"`;
            headers['Cache-Control'] = 'no-cache';
        }

        return new Response(buffer, { headers });
    } catch {
        return new Response('Not found', { status: 404 });
    }
}
