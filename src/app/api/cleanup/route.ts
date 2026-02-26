import { NextResponse } from 'next/server';
import path from 'path';
import { readdir, rm } from 'fs/promises';
import { deleteR2Prefix } from '@/lib/blob-storage';

/** Prefixes to clean — only uploads and variations (mockups/videos are data URLs) */
const CLEANUP_PREFIXES = ['uploads/', 'variations/'];
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
            // directory doesn't exist
        }
    }
    return totalDeleted;
}

export async function POST() {
    try {
        // Clean R2
        const r2Deleted = await deleteR2Prefix(CLEANUP_PREFIXES);

        // Also clean local files
        const localDeleted = await cleanupLocal();

        return NextResponse.json({ deleted: r2Deleted + localDeleted });
    } catch (error) {
        console.error('Cleanup error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
