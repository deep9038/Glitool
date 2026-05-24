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