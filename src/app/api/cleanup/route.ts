import { NextResponse } from 'next/server';

const CLEANUP_PREFIXES = ['uploads/', 'variations/', 'videos/'];

export async function POST() {
    if (process.env.STORAGE_PROVIDER?.trim().toLowerCase() !== 'blob') {
        return NextResponse.json({ deleted: 0, message: 'Not using blob storage' });
    }

    try {
        const { list, del } = await import('@vercel/blob');
        let totalDeleted = 0;

        for (const prefix of CLEANUP_PREFIXES) {
            let cursor: string | undefined;
            do {
                const result = await list({ prefix, cursor, limit: 100 });
                if (result.blobs.length > 0) {
                    await del(result.blobs.map((b) => b.url));
                    totalDeleted += result.blobs.length;
                }
                cursor = result.hasMore ? result.cursor : undefined;
            } while (cursor);
        }

        return NextResponse.json({ deleted: totalDeleted });
    } catch (error) {
        console.error('Cleanup error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
