import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { requireAuth } from '@/lib/api-auth';
import { getAuthUsername } from '@/auth';

const TEMPLATES_DIR = path.join(process.cwd(), '.design-tool-data', 'user-templates');

function userFilePath(username: string, workspaceId: string): string {
    // Sanitize to prevent path traversal
    const safe = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
    return path.join(TEMPLATES_DIR, `${safe}_ws_${safeWs}.json`);
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;

    const username = await getAuthUsername();
    if (!username) {
        return NextResponse.json([], { status: 200 });
    }

    const workspaceId = request.nextUrl.searchParams.get('workspace') || 'default';

    try {
        const filePath = userFilePath(username, workspaceId);
        const data = await fs.readFile(filePath, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch {
        return NextResponse.json([]);
    }
}

export async function PUT(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;

    const username = await getAuthUsername();
    if (!username) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const workspaceId = request.nextUrl.searchParams.get('workspace') || 'default';

    try {
        const templates = await request.json();
        await fs.mkdir(TEMPLATES_DIR, { recursive: true });
        await fs.writeFile(userFilePath(username, workspaceId), JSON.stringify(templates, null, 2));
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Templates save error:', e);
        return NextResponse.json({ error: 'Failed to save templates' }, { status: 500 });
    }
}
