import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUsername } from '@/auth';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    const type = request.nextUrl.searchParams.get('type');

    const where: Record<string, unknown> = {
        workspace: { userId: user.id },
    };
    if (workspaceId) where.workspaceId = workspaceId;
    if (type) where.type = type;

    const assets = await prisma.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(assets);
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { type, filename, url, mimeType, size, metadata, workspaceId } = body;

    if (!type || !filename || !url || !workspaceId) {
        return NextResponse.json({ error: 'type, filename, url, and workspaceId are required' }, { status: 400 });
    }

    // Verify workspace ownership
    const workspace = await prisma.workspace.findFirst({
        where: { id: workspaceId, userId: user.id },
    });
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const asset = await prisma.asset.create({
        data: {
            type,
            filename,
            url,
            mimeType: mimeType || null,
            size: size || null,
            metadata: metadata ? JSON.stringify(metadata) : null,
            workspaceId,
        },
    });
    return NextResponse.json(asset, { status: 201 });
}

export async function DELETE(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const asset = await prisma.asset.findFirst({
        where: { id, workspace: { userId: user.id } },
    });
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    await prisma.asset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
