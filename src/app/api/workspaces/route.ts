import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUsername } from '@/auth';
import { requireAuth } from '@/lib/api-auth';
import { createWorkspaceSchema } from '@/lib/validators';

export async function GET() {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json([]);

    const workspaces = await prisma.workspace.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(workspaces);
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;
    const username = (await getAuthUsername())!;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const parsed = createWorkspaceSchema.safeParse(await request.json());
    if (!parsed.success) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const { name, id: clientId } = parsed.data;

    try {
        // Allow client to specify an id (e.g. "default") — check ownership first
        if (clientId && typeof clientId === 'string') {
            const existing = await prisma.workspace.findFirst({
                where: { id: clientId, userId: user.id },
            });
            if (existing) {
                return NextResponse.json(existing, { status: 200 });
            }
            const workspace = await prisma.workspace.create({
                data: { id: clientId, name, userId: user.id },
            });
            return NextResponse.json(workspace, { status: 201 });
        }

        const workspace = await prisma.workspace.create({
            data: { name, userId: user.id },
        });
        return NextResponse.json(workspace, { status: 201 });
    } catch (err) {
        console.error('[POST /api/workspaces] Error:', err);
        return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
    }
}
