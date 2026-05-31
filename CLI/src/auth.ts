import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

const GLITOOL_DIR = join(os.homedir(), '.glitool');
const ANON_FILE   = join(GLITOOL_DIR, 'anon.json');
const AUTH_FILE   = join(GLITOOL_DIR, 'auth.json');
const BACKEND_URL = process.env.GLITOOL_BACKEND ?? 'https://api.glit.in';
interface AnonData {
    uuid: string;
    requestCount: number;
    createdAt: string;
}

export type Plan = 'anon' | 'free' | 'pro';

export interface AuthData {
    token: string;
    plan: 'free' | 'pro';
    email: string;
    requestsRemaining: number;
    resetDate: string;
    savedAt: string;
}

export const ANON_LIMIT = 5;

function ensureDir() {
    mkdirSync(GLITOOL_DIR, { recursive: true });
}

function readAnon(): AnonData {
    ensureDir();
    if (!existsSync(ANON_FILE)) {
        const data: AnonData = {
            uuid: randomUUID(),
            requestCount: 0,
            createdAt: new Date().toISOString(),
        };
        writeFileSync(ANON_FILE, JSON.stringify(data, null, 2), 'utf-8');
        return data;
    }
    try {
        return JSON.parse(readFileSync(ANON_FILE, 'utf-8')) as AnonData;
    } catch {
        const data: AnonData = { uuid: randomUUID(), requestCount: 0, createdAt: new Date().toISOString() };
        writeFileSync(ANON_FILE, JSON.stringify(data, null, 2), 'utf-8');
        return data;
    }
}

function writeAnon(data: AnonData) {
    ensureDir();
    writeFileSync(ANON_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getOrCreateAnonId(): string {
    return readAnon().uuid;
}

export function getAnonRequestCount(): number {
    return readAnon().requestCount;
}

export function incrementAnonCount(): number {
    const data = readAnon();
    data.requestCount += 1;
    writeAnon(data);
    return data.requestCount;
}

export function isAnonLimitReached(): boolean {
    return readAnon().requestCount >= ANON_LIMIT;
}

export function readAuth(): AuthData | null {
    ensureDir();
    if (!existsSync(AUTH_FILE)) return null;
    try {
        return JSON.parse(readFileSync(AUTH_FILE, 'utf-8')) as AuthData;
    } catch {
        return null;
    }
}

export function saveAuth(data: AuthData) {
    ensureDir();
    writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getAuthToken(): string | null {
    return readAuth()?.token ?? null;
}

export function isAuthenticated(): boolean {
    return !!readAuth()?.token;
}

/**
 * Update the cached plan in auth.json based on the latest server response header.
 * No-op if the file doesn't exist (anon user — plan is implied), or if unchanged.
 */
export function persistPlan(plan: Plan): void {
    if (plan === 'anon') return;
    ensureDir();
    try {
        const existing = existsSync(AUTH_FILE)
            ? JSON.parse(readFileSync(AUTH_FILE, 'utf-8'))
            : null;
        if (!existing) return;
        if (existing.plan === plan) return;
        existing.plan = plan;
        writeFileSync(AUTH_FILE, JSON.stringify(existing, null, 2), 'utf-8');
    } catch {}
}

/**
 * Best-known plan at this instant. Used for client-side budget decisions
 * (history trim, compaction threshold). Cold start defaults to 'anon' if no
 * auth file, then corrects on the next response via persistPlan().
 *
 * BYOK (OPENAI_API_KEY set) behaves like 'pro' for budgets since the user is
 * paying OpenAI directly — no Glitool server in the path.
 */
export function getCurrentPlan(): Plan {
    if (process.env.OPENAI_API_KEY) return 'pro';
    const auth = readAuth();
    if (!auth) return 'anon';
    return auth.plan === 'pro' ? 'pro' : 'free';
}
export interface DeviceFlowStart {
    device_code:       string;
    user_code:         string;
    expires_in:        number;
    verification_uri:  string;
}

export interface DeviceFlowPoll {
    status:              'pending' | 'complete' | 'expired';
    access_token?:       string;
    plan?:               'free' | 'pro';
    email?:              string;
    requests_remaining?: number | null;
    reset_date?:         string;
}

export async function startDeviceFlow(): Promise<DeviceFlowStart> {
    const res = await fetch(`${BACKEND_URL}/auth/device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json() as Promise<DeviceFlowStart>;
}

export async function pollDeviceFlow(deviceCode: string): Promise<DeviceFlowPoll> {
    const res = await fetch(`${BACKEND_URL}/auth/device/poll?device_code=${deviceCode}`);
    if (!res.ok) throw new Error(`Poll error: ${res.status}`);
    return res.json() as Promise<DeviceFlowPoll>;
}