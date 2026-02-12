import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ensureStorageDir } from '@/lib/storage';

export async function POST(request: NextRequest) {
    try {
        const UPLOAD_DIR = await ensureStorageDir('uploads');

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
        const filepath = path.join(UPLOAD_DIR, filename);

        await writeFile(filepath, buffer);

        return NextResponse.json({
            id,
            name: file.name,
            url: `/api/files/uploads/${filename}`,
            size: file.size,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Upload failed' },
            { status: 500 }
        );
    }
}
