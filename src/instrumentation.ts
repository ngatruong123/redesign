export async function onRequestError() {
    // required export for instrumentation
}

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { cleanupOldFiles } = await import('@/lib/storage');
        const types = ['uploads', 'variations', 'mockups'] as const;
        for (const type of types) {
            const removed = await cleanupOldFiles(type);
            if (removed > 0) {
                console.log(`[cleanup] Removed ${removed} old files from ${type}`);
            }
        }
    }
}
