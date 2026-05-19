import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_PATH = path.join(os.homedir(), '.glitool', 'debug.log');
try { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); } catch {}
export function log(event: string, data?: Record<string, any>): void {
    const line = JSON.stringify({
        t: new Date().toISOString().slice(11, 23),
        event,
        ...data,
    });
    try {
        fs.appendFileSync(LOG_PATH, line + '\n');
    } catch {}
}

export function clearLog(): void {
    try { fs.writeFileSync(LOG_PATH, ''); } catch {}
}
