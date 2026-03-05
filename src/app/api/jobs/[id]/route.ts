import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getJobStatus } from '@/lib/job-queue';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireAuth();
    if (authError) return authError;
    const { id } = await params;
    const job = getJobStatus(id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json(job);
}
