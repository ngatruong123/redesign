import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { getAuthUsername } from '@/auth';

/**
 * One-time migration: merge legacy templates from workspace.data into Asset TEMPLATE.
 * POST /api/migrate-templates
 */
export async function POST() {
    const authError = await requireAuth();
    if (authError) return authError;

    const username = await getAuthUsername();
    if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const workspaces = await prisma.workspace.findMany({ where: { userId: user.id } });
    const results: { wsId: string; migrated: number; total: number }[] = [];

    for (const ws of workspaces) {
        // Parse legacy templates from workspace.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let legacyTemplates: any[] = [];
        try {
            const wsData = ws.data
                ? (typeof ws.data === 'string' ? JSON.parse(ws.data) : ws.data) as Record<string, unknown>
                : null;
            if (Array.isArray(wsData?.mockupTemplates)) {
                legacyTemplates = wsData.mockupTemplates;
            }
        } catch { continue; }

        if (legacyTemplates.length === 0) {
            results.push({ wsId: ws.id, migrated: 0, total: 0 });
            continue;
        }

        // Find or create Asset TEMPLATE
        const asset = await prisma.asset.findFirst({
            where: { workspaceId: ws.id, type: 'TEMPLATE' },
        });

        if (!asset) {
            // Create new Asset with all legacy templates
            await prisma.asset.create({
                data: {
                    type: 'TEMPLATE',
                    filename: 'templates.json',
                    url: '',
                    workspaceId: ws.id,
                    metadata: { templates: legacyTemplates },
                },
            });
            results.push({ wsId: ws.id, migrated: legacyTemplates.length, total: legacyTemplates.length });
        } else {
            // Merge: add legacy templates missing from Asset
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing = ((asset.metadata as any)?.templates || []) as any[];
            const existingIds = new Set(existing.map((t: { id?: string }) => t.id).filter(Boolean));
            const toAdd = legacyTemplates.filter((t: { id?: string }) => t.id && !existingIds.has(t.id));

            if (toAdd.length > 0) {
                const merged = [...existing, ...toAdd];
                await prisma.asset.update({
                    where: { id: asset.id },
                    data: { metadata: { templates: merged } },
                });
                results.push({ wsId: ws.id, migrated: toAdd.length, total: merged.length });
            } else {
                results.push({ wsId: ws.id, migrated: 0, total: existing.length });
            }
        }
    }

    return NextResponse.json({ ok: true, results });
}
