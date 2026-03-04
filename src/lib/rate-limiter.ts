interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
let lastCleanup = Date.now();

export interface RateLimitResult {
    allowed: boolean;
    retryAfterMs: number;
}

/**
 * Sliding window rate limiter.
 * @param key - unique identifier (e.g. IP + route)
 * @param limit - max requests per window
 * @param windowMs - window size in ms
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();

    // Lazy cleanup every 60s instead of module-level setInterval
    if (now - lastCleanup > 60_000) {
        lastCleanup = now;
        for (const [k, e] of store) {
            e.timestamps = e.timestamps.filter((t) => now - t < 120_000);
            if (e.timestamps.length === 0) store.delete(k);
        }
    }

    let entry = store.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= limit) {
        const oldest = entry.timestamps[0];
        const retryAfterMs = oldest + windowMs - now;
        return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    entry.timestamps.push(now);
    return { allowed: true, retryAfterMs: 0 };
}
