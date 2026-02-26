import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const TEMPLATES_DIR = path.join(process.cwd(), '.design-tool-data', 'user-templates');

function getUsername(request: NextRequest): string | null {
    return request.cookies.get('design-tool-user')?.value || null;
}

function userFilePath(username: string): string {
    // Sanitize username to prevent path traversal
    const safe = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(TEMPLATES_DIR, `${safe}.json`);
}

export async function GET(request: NextRequest) {
    const username = getUsername(request);
    if (!username) {
        return NextResponse.json([], { status: 200 });
    }

    try {
        const filePath = userFilePath(username);
        const data = await fs.readFile(filePath, 'utf-8');
        return NextResponse.json(JSON.parse(data));
    } catch {
        return NextResponse.json([]);
    }
}

export async function PUT(request: NextRequest) {
    const username = getUsername(request);
    if (!username) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const templates = await request.json();
        await fs.mkdir(TEMPLATES_DIR, { recursive: true });
        await fs.writeFile(userFilePath(username), JSON.stringify(templates, null, 2));
        return NextResponse.json({ ok: true });
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
