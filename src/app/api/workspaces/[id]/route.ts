import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUsername } from '@/auth';
import { requireAuth } from '@/lib/api-auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    try {
        const { id } = await params;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const workspace = await prisma.workspace.findFirst({
            where: { id, userId: user.id },
        });
        if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        return NextResponse.json(workspace);
    } catch (err) {
        console.error('[GET /api/workspaces/[id]] Error:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    try {
        const { id } = await params;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const workspace = await prisma.workspace.findFirst({
            where: { id, userId: user.id },
        });
        if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const body = await request.json();
        const updated = await prisma.workspace.update({
            where: { id },
            data: {
                name: body.name ?? workspace.name,
                data: body.data !== undefined ? (typeof body.data === 'string' ? body.data : JSON.stringify(body.data)) : workspace.data,
            },
        });
        return NextResponse.json(updated);
    } catch (err) {
        console.error('[PUT /api/workspaces/[id]] Error:', err);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const workspace = await prisma.workspace.findFirst({
        where: { id, userId: user.id },
    });
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.workspace.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
