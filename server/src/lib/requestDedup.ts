const COUNTED_REQUEST_IDS = new Map<string, number>();
const CACHE_TTL_MS = 5 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of COUNTED_REQUEST_IDS) {
        if (now - ts > CACHE_TTL_MS) {
            COUNTED_REQUEST_IDS.delete(id);
        }
    }
}, 60 * 1000);

export function wasAlreadyCounted(reqId: string): boolean {
    return COUNTED_REQUEST_IDS.has(reqId);
}

export function markCounted(reqId: string): void {
    COUNTED_REQUEST_IDS.set(reqId, Date.now());
}
