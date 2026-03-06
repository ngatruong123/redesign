import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { getAuthUsername } from '@/auth';

export async function GET(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;

    const username = await getAuthUsername();
    if (!username) return NextResponse.json([]);

    const workspaceId = request.nextUrl.searchParams.get('workspace') || 'default';

    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return NextResponse.json([]);

        // Find workspace owned by user
        const workspace = await prisma.workspace.findFirst({
            where: { id: workspaceId, userId: user.id },
        });
        if (!workspace) return NextResponse.json([]);

        // Find the TEMPLATE asset for this workspace
        let asset = await prisma.asset.findFirst({
            where: { workspaceId: workspace.id, type: 'TEMPLATE' },
        });

        // Auto-migrate: if no Asset TEMPLATE exists, check workspace.data for legacy templates
        if (!asset) {
            const wsData = workspace.data
                ? (typeof workspace.data === 'string' ? JSON.parse(workspace.data) : workspace.data) as Record<string, unknown>
                : null;
            const legacyTemplates = wsData?.mockupTemplates;
            if (Array.isArray(legacyTemplates) && legacyTemplates.length > 0) {
                asset = await prisma.asset.create({
                    data: {
                        type: 'TEMPLATE',
                        filename: 'templates.json',
                        url: '',
                        workspaceId: workspace.id,
                        metadata: { templates: legacyTemplates },
                    },
                });
                console.log(`[GET /api/templates] Migrated ${legacyTemplates.length} templates from workspace.data for ws=${workspaceId}`);
            }
        }

        if (!asset?.metadata) return NextResponse.json([]);
        const templates = (asset.metadata as { templates?: unknown[] })?.templates;
        return NextResponse.json(Array.isArray(templates) ? templates : []);
    } catch (err) {
        console.error('[GET /api/templates] Error:', err);
        return NextResponse.json([]);
    }
}

export async function PUT(request: NextRequest) {
    const authError = await requireAuth();
    if (authError) return authError;

    const username = await getAuthUsername();
    if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const workspaceId = request.nextUrl.searchParams.get('workspace') || 'default';

    try {
        const templates = await request.json();
        if (!Array.isArray(templates)) {
            return NextResponse.json({ error: 'Expected array' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const workspace = await prisma.workspace.findFirst({
            where: { id: workspaceId, userId: user.id },
        });
        if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

        // Upsert: find existing TEMPLATE asset or create
        const existing = await prisma.asset.findFirst({
            where: { workspaceId: workspace.id, type: 'TEMPLATE' },
        });

        if (existing) {
            await prisma.asset.update({
                where: { id: existing.id },
                data: { metadata: { templates } },
            });
        } else {
            await prisma.asset.create({
                data: {
                    type: 'TEMPLATE',
                    filename: 'templates.json',
                    url: '',
                    workspaceId: workspace.id,
                    metadata: { templates },
                },
            });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[PUT /api/templates] Error:', err);
        return NextResponse.json({ error: 'Failed to save templates' }, { status: 500 });
    }
}
