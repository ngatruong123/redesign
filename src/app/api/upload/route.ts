import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { storeFile } from '@/lib/blob-storage';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
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

        const { url } = await storeFile('uploads', filename, buffer);

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
