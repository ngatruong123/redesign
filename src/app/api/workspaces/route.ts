import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

async function getUsername(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get('design-tool-user')?.value || null;
}

export async function GET() {
    const username = await getUsername();
    if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    const username = await getUsername();
    if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { name } = await request.json();
    if (!name || typeof name !== 'string') {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const workspace = await prisma.workspace.create({
        data: { name, userId: user.id },
    });
    return NextResponse.json(workspace, { status: 201 });
}
