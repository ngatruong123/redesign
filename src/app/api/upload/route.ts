import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { storeFile, storeTemplateFile } from '@/lib/blob-storage';
import { requireAuth } from '@/lib/api-auth';

function getCorsHeaders(request: NextRequest): Record<string, string> {
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

    const allowedExtIds = (process.env.ALLOWED_EXTENSION_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAllowedExtension = origin.startsWith('chrome-extension://') &&
        allowedExtIds.length > 0 &&
        allowedExtIds.some(id => origin === `chrome-extension://${id}`);

    const isAllowed =
        isAllowedExtension ||
        origin === appUrl ||
        allowedOrigins.includes(origin);

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

export async function OPTIONS(request: NextRequest) {
    return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function POST(request: NextRequest) {
    const corsHeaders = getCorsHeaders(request);
    const origin = request.headers.get('origin') || '';

    // Skip auth for allowed Chrome extension uploads
    const allowedExtIds = (process.env.ALLOWED_EXTENSION_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAllowedExt = origin.startsWith('chrome-extension://') &&
        allowedExtIds.length > 0 &&
        allowedExtIds.some(id => origin === `chrome-extension://${id}`);
    if (!isAllowedExt) {
        const authError = await requireAuth();
        if (authError) return authError;
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400, headers: corsHeaders });
        }

        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.` },
                { status: 413, headers: corsHeaders }
            );
        }

        const uploadType = formData.get('type') as string | null;

        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Allowed: PNG, JPG, WebP, SVG' },
                { status: 400, headers: corsHeaders }
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
        }, { headers: corsHeaders });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Upload failed' },
            { status: 500, headers: corsHeaders }
        );
    }
}
