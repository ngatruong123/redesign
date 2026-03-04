/**
 * Migration script: reads Workspace.data JSON blobs and creates Asset records.
 *
 * Usage: npx tsx scripts/migrate-json-to-assets.ts
 */
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

interface DesignData {
    id: string;
    imageUrl: string;
    filename?: string;
}

interface VariationData {
    id: string;
    imageUrl: string;
    styleName?: string;
}

interface TemplateData {
    id: string;
    imageUrl: string;
    name?: string;
}

interface WorkspaceData {
    designs?: DesignData[];
    variations?: VariationData[];
    mockupTemplates?: TemplateData[];
}

async function main() {
    const workspaces = await prisma.workspace.findMany({
        where: { data: { not: null } },
        select: { id: true, data: true },
    });

    let totalAssets = 0;

    for (const ws of workspaces) {
        if (!ws.data) continue;

        let parsed: WorkspaceData;
        try {
            parsed = JSON.parse(ws.data);
        } catch {
            console.warn(`Skipping workspace ${ws.id}: invalid JSON`);
            continue;
        }

        const assets: Array<{
            type: 'UPLOAD' | 'VARIATION' | 'TEMPLATE';
            filename: string;
            url: string;
            workspaceId: string;
        }> = [];

        if (parsed.designs) {
            for (const d of parsed.designs) {
                assets.push({
                    type: 'UPLOAD',
                    filename: d.filename || d.id,
                    url: d.imageUrl,
                    workspaceId: ws.id,
                });
            }
        }

        if (parsed.variations) {
            for (const v of parsed.variations) {
                assets.push({
                    type: 'VARIATION',
                    filename: v.styleName || v.id,
                    url: v.imageUrl,
                    workspaceId: ws.id,
                });
            }
        }

        if (parsed.mockupTemplates) {
            for (const t of parsed.mockupTemplates) {
                assets.push({
                    type: 'TEMPLATE',
                    filename: t.name || t.id,
                    url: t.imageUrl,
                    workspaceId: ws.id,
                });
            }
        }

        if (assets.length > 0) {
            await prisma.asset.createMany({ data: assets });
            totalAssets += assets.length;
            console.log(`Workspace ${ws.id}: created ${assets.length} assets`);
        }
    }

    console.log(`Done. Created ${totalAssets} assets from ${workspaces.length} workspaces.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
