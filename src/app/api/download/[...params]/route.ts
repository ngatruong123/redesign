import { NextRequest } from 'next/server';
import { resolveToBuffer } from '@/lib/blob-storage';
import path from 'path';
import { requireAuth } from '@/lib/api-auth';

// URL format: /api/download/{desired-filename}?source={imageUrl}
// The source can be a blob URL or a local /api/files/ URL
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ params: string[] }> }
) {
    const authError = await requireAuth();
    if (authError) return authError;
    const segments = (await params).params;
    if (!segments || segments.length < 1) {
        return new Response('Not found', { status: 404 });
    }

    const downloadName = decodeURIComponent(segments[0]);
    const source = request.nextUrl.searchParams.get('source');
    if (!source) {
        return new Response('Missing source parameter', { status: 400 });
    }

    try {
        const buffer = await resolveToBuffer(source);

        const ext = path.extname(downloadName).toLowerCase();
        const types: Record<string, string> = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.webp': 'image/webp', '.zip': 'application/zip',
            '.mp4': 'video/mp4',
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
