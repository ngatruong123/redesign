import { NextResponse } from 'next/server';
import path from 'path';
import { readdir, rm, mkdir } from 'fs/promises';

/** Prefixes to clean — everything except templates */
const CLEANUP_PREFIXES = ['uploads/', 'variations/', 'videos/', 'mockups/'];
const CACHE_ROOT = path.join(process.cwd(), '.design-tool-data');

async function cleanupLocal() {
    let totalDeleted = 0;
    for (const prefix of CLEANUP_PREFIXES) {
        const dir = path.join(CACHE_ROOT, prefix);
        try {
            const files = await readdir(dir);
            for (const file of files) {
                await rm(path.join(dir, file), { force: true });
                totalDeleted++;
            }
        } catch {
            // directory doesn't exist — nothing to clean
        }
    }
    return totalDeleted;
}

async function cleanupBlob() {
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

    return totalDeleted;
}

export async function POST() {
    try {
        const isBlob = process.env.STORAGE_PROVIDER?.trim().toLowerCase() === 'blob';
        const deleted = isBlob ? await cleanupBlob() : await cleanupLocal();

        return NextResponse.json({ deleted });
    } catch (error) {
        console.error('Cleanup error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
