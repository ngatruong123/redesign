import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { storeFile, storeTemplateFile } from '@/lib/blob-storage';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 50MB.` },
                { status: 413 }
            );
        }

        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Allowed: PNG, JPG, WebP, SVG' },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = file.name.split('.').pop() || 'png';
        const id = uuidv4();
        const filename = `${id}.${ext}`;

        const uploadType = formData.get('type') as string | null;
        const { url } = uploadType === 'template'
            ? await storeTemplateFile(filename, buffer)
            : await storeFile('uploads', filename, buffer);

        return NextResponse.json({
            id,
            name: file.name,
            url,
            size: file.size,
        });
    } catch (error) {
        console.error('Upload error:', error);
        console.error('STORAGE_PROVIDER:', JSON.stringify(process.env.STORAGE_PROVIDER));
        return NextResponse.json(
            { error: 'Upload failed', detail: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
