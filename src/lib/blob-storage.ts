import path from 'path';
import { writeFile, readFile, mkdir } from 'fs/promises';

type StorageType = 'uploads' | 'variations' | 'mockups' | 'videos';

const CACHE_ROOT = path.join(process.cwd(), '.design-tool-data');

function isR2(): boolean {
    return !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

function getLocalDir(type: StorageType): string {
    return path.join(CACHE_ROOT, type);
}

function getR2PublicUrl(key: string): string {
    const base = process.env.R2_PUBLIC_URL || '';
    return `${base.replace(/\/$/, '')}/${key}`;
}

async function getR2Client() {
    const { S3Client } = await import('@aws-sdk/client-s3');
    return new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
    });
}

export async function storeFile(
    type: StorageType,
    filename: string,
    data: Buffer,
): Promise<{ url: string; pathname: string }> {
    const pathname = `${type}/${filename}`;

    if (isR2()) {
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        const client = await getR2Client();
        await client.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: pathname,
            Body: data,
            ContentType: filename.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
        }));
        return { url: getR2PublicUrl(pathname), pathname };
    }

    const dir = getLocalDir(type);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), data);
    return { url: `/api/files/${pathname}`, pathname };
}

/**
 * Store a mockup template file. Uses R2 when configured
 * so templates persist across deploys.
 */
export async function storeTemplateFile(
    filename: string,
    data: Buffer,
): Promise<{ url: string; pathname: string }> {
    const pathname = `templates/${filename}`;

    if (isR2()) {
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        const client = await getR2Client();
        await client.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: pathname,
            Body: data,
            ContentType: filename.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
        }));
        return { url: getR2PublicUrl(pathname), pathname };
    }

    // Fallback to local
    const dir = path.join(CACHE_ROOT, 'templates');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), data);
    return { url: `/api/files/${pathname}`, pathname };
}

/** Delete all files under given prefixes from R2 */
export async function deleteR2Prefix(prefixes: string[]): Promise<number> {
    if (!isR2()) return 0;

    const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const client = await getR2Client();
    const bucket = process.env.R2_BUCKET_NAME!;
    let totalDeleted = 0;

    for (const prefix of prefixes) {
        let continuationToken: string | undefined;
        do {
            const list = await client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken: continuationToken,
                MaxKeys: 1000,
            }));

            const keys = list.Contents?.map((o) => ({ Key: o.Key! })) || [];
            if (keys.length > 0) {
                await client.send(new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: { Objects: keys },
                }));
                totalDeleted += keys.length;
            }

            continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
        } while (continuationToken);
    }

    return totalDeleted;
}

export async function resolveToBuffer(url: string): Promise<Buffer> {
    if (!url) throw new Error('No URL provided');

    // Remote URLs (R2 public, Vercel Blob, etc.)
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
    } catch (err) {
        console.warn('[resolveToBuffer] Error reading cache path, falling back to public/:', err);
        // Fallback to public/
        const publicPath = path.join(process.cwd(), 'public', dir, filename);
        return await readFile(publicPath);
    }
}
