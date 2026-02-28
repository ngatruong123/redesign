'use server';

import { v4 as uuidv4 } from 'uuid';
import { storeFile, storeTemplateFile } from '@/lib/blob-storage';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadFile(formData: FormData): Promise<{
    id: string;
    name: string;
    url: string;
    size: number;
} | { error: string }> {
    const file = formData.get('file') as File | null;

    if (!file) {
        return { error: 'No file uploaded' };
    }

    if (file.size > MAX_FILE_SIZE) {
        return { error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa 5MB.` };
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
        return { error: 'Định dạng không hỗ trợ. Chỉ chấp nhận: PNG, JPG, WebP, SVG' };
    }

    try {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = file.name.split('.').pop() || 'png';
        const id = uuidv4();
        const filename = `${id}.${ext}`;

        const uploadType = formData.get('type') as string | null;
        const { url } = uploadType === 'template'
            ? await storeTemplateFile(filename, buffer)
            : await storeFile('uploads', filename, buffer);

        return { id, name: file.name, url, size: file.size };
    } catch (error) {
        console.error('Upload error:', error);
        return { error: 'Upload thất bại: ' + (error instanceof Error ? error.message : String(error)) };
    }
}
