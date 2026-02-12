/**
 * Run async tasks in parallel with a concurrency limit.
 * Calls `onResult` as each task completes.
 */
export async function parallelLimit<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    limit: number = 3,
    onResult?: (result: R, index: number) => void,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const idx = nextIndex++;
            const result = await fn(items[idx]);
            results[idx] = result;
            onResult?.(result, idx);
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}
