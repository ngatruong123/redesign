import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { storeFile, storeTemplateFile } from '@/lib/blob-storage';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400, headers: CORS_HEADERS });
        }

        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.` },
                { status: 413, headers: CORS_HEADERS }
            );
        }

        const uploadType = formData.get('type') as string | null;

        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Allowed: PNG, JPG, WebP, SVG' },
                { status: 400, headers: CORS_HEADERS }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = file.name.split('.').pop() || 'png';
        const id = uuidv4();
        const filename = `${id}.${ext}`;

        const { url } = uploadType === 'template'
            ? await storeTemplateFile(filename, buffer)
            : await storeFile('uploads', filename, buffer);

        return NextResponse.json({
            id,
            name: file.name,
            url,
            size: file.size,
        }, { headers: CORS_HEADERS });
    } catch (error) {
        console.error('Upload error:', error);
        console.error('STORAGE_PROVIDER:', JSON.stringify(process.env.STORAGE_PROVIDER));
        return NextResponse.json(
            { error: 'Upload failed', detail: error instanceof Error ? error.message : String(error) },
            { status: 500, headers: CORS_HEADERS }
        );
    }
}
