import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { resolvePublicPath } from '@/lib/resolve-path';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || '';
    const name = searchParams.get('name') || 'mockup.png';

    try {
        const absolutePath = resolvePublicPath(source);
        if (!absolutePath) {
            return new Response('Invalid path', { status: 403 });
        }

        const fileBuffer = await readFile(absolutePath);
        const isZip = name.endsWith('.zip');
        const contentType = isZip ? 'application/zip' : 'image/png';

        return new Response(fileBuffer, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${name}"`,
                'Content-Length': String(fileBuffer.length),
            },
        });
    } catch {
        return new Response('File not found', { status: 404 });
    }
}
