import { NextRequest } from 'next/server';
import { resolveToBuffer } from '@/lib/blob-storage';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || '';
    const name = searchParams.get('name') || 'mockup.png';

    try {
        const fileBuffer = await resolveToBuffer(source);
        const isZip = name.endsWith('.zip');
        const contentType = isZip ? 'application/zip' : 'image/png';

        return new Response(new Uint8Array(fileBuffer), {
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
