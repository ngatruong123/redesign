import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUsername } from '@/auth';
import { requireAuth } from '@/lib/api-auth';
import { updateWorkspaceSchema } from '@/lib/validators';

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
        const parsed = updateWorkspaceSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
        }
        const updated = await prisma.workspace.update({
            where: { id },
            data: {
                name: parsed.data.name ?? workspace.name,
                data: parsed.data.data !== undefined ? (typeof parsed.data.data === 'string' ? parsed.data.data : JSON.stringify(parsed.data.data)) : workspace.data,
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

    try {
        const { id } = await params;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const workspace = await prisma.workspace.findFirst({
            where: { id, userId: user.id },
        });
        if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        await prisma.workspace.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Workspace delete error:', e);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
