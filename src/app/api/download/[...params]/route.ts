import { NextRequest } from 'next/server';
import { resolveToBuffer } from '@/lib/blob-storage';
import path from 'path';

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

    try {
        const buffer = await resolveToBuffer(`/api/files/${dir}/${filename}`);

        const ext = path.extname(filename).toLowerCase();
        const types: Record<string, string> = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.webp': 'image/webp', '.zip': 'application/zip',
        };

        return new Response(new Uint8Array(buffer), {
            headers: {
                'Content-Type': types[ext] || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
                'Content-Length': String(buffer.length),
                'Cache-Control': 'no-cache',
            },
        });
    } catch {
        return new Response('Not found', { status: 404 });
    }
}
