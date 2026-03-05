import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
    prisma: {
        user: { findUnique: vi.fn() },
        workspace: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    },
}));
vi.mock('@/lib/api-auth', () => ({
    requireAuth: vi.fn(() => null),
}));
vi.mock('@/auth', () => ({
    getAuthUsername: vi.fn(() => 'testuser'),
}));

import { prisma } from '@/lib/db';
import { GET, POST } from '@/app/api/workspaces/route';
import { GET as GET_BY_ID, PUT, DELETE } from '@/app/api/workspaces/[id]/route';

const mockUser = { id: 'user-1', username: 'testuser' };
const mockWorkspace = { id: 'ws-1', name: 'My Workspace', userId: 'user-1', createdAt: new Date(), updatedAt: new Date(), data: null };

function makeRequest(url: string, options?: RequestInit) {
    return new NextRequest(new URL(url, 'http://localhost:3000'), options as never);
}

function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
});

describe('GET /api/workspaces', () => {
    it('returns user workspaces', async () => {
        vi.mocked(prisma.workspace.findMany).mockResolvedValue([mockWorkspace] as never);
        const res = await GET();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0].id).toBe('ws-1');
    });
});

describe('POST /api/workspaces', () => {
    it('creates workspace with name', async () => {
        vi.mocked(prisma.workspace.create).mockResolvedValue(mockWorkspace as never);
        const req = makeRequest('http://localhost:3000/api/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: 'My Workspace' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.name).toBe('My Workspace');
    });

    it('with client ID, creates if not exists', async () => {
        vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null as never);
        vi.mocked(prisma.workspace.create).mockResolvedValue({ ...mockWorkspace, id: 'custom-id' } as never);
        const req = makeRequest('http://localhost:3000/api/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: 'My Workspace', id: 'custom-id' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(201);
        expect(prisma.workspace.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ id: 'custom-id' }) })
        );
    });

    it('with client ID of existing workspace, returns it', async () => {
        vi.mocked(prisma.workspace.findFirst).mockResolvedValue(mockWorkspace as never);
        const req = makeRequest('http://localhost:3000/api/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: 'My Workspace', id: 'ws-1' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(prisma.workspace.create).not.toHaveBeenCalled();
    });

    it('rejects empty name', async () => {
        const req = makeRequest('http://localhost:3000/api/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: '' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/name/i);
    });
});

describe('GET /api/workspaces/[id]', () => {
    it('returns workspace data', async () => {
        vi.mocked(prisma.workspace.findFirst).mockResolvedValue(mockWorkspace as never);
        const req = makeRequest('http://localhost:3000/api/workspaces/ws-1');
        const res = await GET_BY_ID(req, makeParams('ws-1'));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe('ws-1');
    });

    it('cannot access other user workspace (IDOR)', async () => {
        vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null as never);
        const req = makeRequest('http://localhost:3000/api/workspaces/other-ws');
        const res = await GET_BY_ID(req, makeParams('other-ws'));
        expect(res.status).toBe(404);
    });
});

describe('PUT /api/workspaces/[id]', () => {
    it('updates workspace data', async () => {
        vi.mocked(prisma.workspace.findFirst).mockResolvedValue(mockWorkspace as never);
        vi.mocked(prisma.workspace.update).mockResolvedValue({ ...mockWorkspace, name: 'Updated' } as never);
        const req = makeRequest('http://localhost:3000/api/workspaces/ws-1', {
            method: 'PUT',
            body: JSON.stringify({ name: 'Updated' }),
        });
        const res = await PUT(req, makeParams('ws-1'));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.name).toBe('Updated');
    });
});

describe('DELETE /api/workspaces/[id]', () => {
    it('deletes workspace', async () => {
        vi.mocked(prisma.workspace.findFirst).mockResolvedValue(mockWorkspace as never);
        vi.mocked(prisma.workspace.delete).mockResolvedValue(mockWorkspace as never);
        const req = makeRequest('http://localhost:3000/api/workspaces/ws-1');
        const res = await DELETE(req, makeParams('ws-1'));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });
});
