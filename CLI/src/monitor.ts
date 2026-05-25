export function emit(type: string, data: Record<string, any> = {}): void {
    if (!process.env.GLITOOL_DEV_MONITOR) return;
    fetch('http://localhost:4000/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...data, t: new Date().toISOString() }),
    }).catch(() => {});
}
