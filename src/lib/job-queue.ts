type JobHandler<T = unknown> = (payload: T) => Promise<void>;

interface Job<T = unknown> {
    id: string;
    type: string;
    payload: T;
    status: 'pending' | 'running' | 'done' | 'failed';
    error?: string;
    createdAt: Date;
}

const jobs = new Map<string, Job>();
const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler) {
    handlers.set(type, handler);
}

export function enqueueJob<T>(type: string, payload: T): string {
    const id = crypto.randomUUID();
    const job: Job<T> = { id, type, payload, status: 'pending', createdAt: new Date() };
    jobs.set(id, job as Job);
    // Process async
    setTimeout(() => processJob(id), 0);
    return id;
}

export function getJobStatus(id: string): Job | undefined {
    cleanupJobs();
    return jobs.get(id);
}

async function processJob(id: string) {
    const job = jobs.get(id);
    if (!job) return;
    const handler = handlers.get(job.type);
    if (!handler) { job.status = 'failed'; job.error = 'No handler'; return; }
    job.status = 'running';
    try {
        await handler(job.payload);
        job.status = 'done';
    } catch (err) {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
    }
}

// Cleanup old jobs every 10 minutes
let lastCleanup = Date.now();
export function cleanupJobs() {
    const now = Date.now();
    if (now - lastCleanup < 600_000) return;
    lastCleanup = now;
    for (const [id, job] of jobs) {
        if ((job.status === 'done' || job.status === 'failed') && now - job.createdAt.getTime() > 3600_000) {
            jobs.delete(id);
        }
    }
}
