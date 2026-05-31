import { ChatOpenAI } from '@langchain/openai';
import { randomUUID } from 'crypto';
import { getAuthToken, getOrCreateAnonId, persistPlan, type Plan } from '../auth.js';

function backendUrl(): string {
    return process.env.GLITOOL_BACKEND ?? 'https://api.glit.in';
}

let currentRequestId: string | null = null;
const resolvedModelByRequest = new Map<string, string>();

interface TokenUsage { used: number; limit: number; }
const tokenUsageByRequest = new Map<string, TokenUsage>();

export function startNewRequest(): string {
    currentRequestId = randomUUID();
    return currentRequestId;
}

/**
 * Returns the actual model the server resolved for the current request,
 * captured from the X-Glitool-Resolved-Model response header.
 * Returns null until the first response of the current request has come back,
 * or always when running BYOK (no Glitool server in the path).
 */
export function getResolvedModelForCurrentRequest(): string | null {
    return currentRequestId ? resolvedModelByRequest.get(currentRequestId) ?? null : null;
}

/**
 * Returns the latest tokens_used/limit pair the server reported, captured from
 * X-Glitool-Tokens-Used / X-Glitool-Tokens-Limit headers. Used by the StatusBar.
 */
export function getTokenUsageForCurrentRequest(): TokenUsage | null {
    return currentRequestId ? tokenUsageByRequest.get(currentRequestId) ?? null : null;
}

function requestIdHeader(): Record<string, string> {
    return currentRequestId ? { 'X-Glitool-Request-ID': currentRequestId } : {};
}

// Wraps fetch to capture server-side headers from every response:
//   X-Glitool-Resolved-Model — actual model the server routed to
//   X-Glitool-Plan           — server's view of the user's tier (persisted to disk)
//   X-Glitool-Tokens-Used    — running token total for this user
//   X-Glitool-Tokens-Limit   — current tier's cap
// requestId is bound at LLM construction time so concurrent requests stay disjoint.
function makeCaptureFetch(requestId: string | null): typeof fetch {
    return async (input, init) => {
        const response = await fetch(input as any, init);
        try {
            const resolved = response.headers.get('X-Glitool-Resolved-Model');
            if (resolved && requestId) {
                resolvedModelByRequest.set(requestId, resolved);
            }

            const plan = response.headers.get('X-Glitool-Plan');
            if (plan === 'free' || plan === 'pro' || plan === 'anon') {
                persistPlan(plan as Plan);
            }

            const used  = Number(response.headers.get('X-Glitool-Tokens-Used'));
            const limit = Number(response.headers.get('X-Glitool-Tokens-Limit'));
            if (requestId && Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
                tokenUsageByRequest.set(requestId, { used, limit });
            }
        } catch {}
        return response;
    };
}

interface LlmExtras {
    temperature?:  number;
    modelKwargs?:  Record<string, unknown>;
    streaming?:    boolean;
}

export function makeLlm(model: string, extras: LlmExtras = {}): ChatOpenAI {
    if (process.env.OPENAI_API_KEY) {
        // BYOK path bypasses the Glitool server entirely — no header to capture.
        return new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY, streaming: true, ...extras });
    }

    const captureFetch = makeCaptureFetch(currentRequestId);

    const token = getAuthToken();
    if (token) {
        return new ChatOpenAI({
            model,
            apiKey: token,
            streaming: true,
            configuration: {
                baseURL: `${backendUrl()}/v1`,
                defaultHeaders: requestIdHeader(),
                fetch: captureFetch as any,
            },
            ...extras,
        });
    }

    return new ChatOpenAI({
        model,
        apiKey: 'anon',
        streaming: true,
        maxTokens: 8192,
        configuration: {
            baseURL: `${backendUrl()}/v1`,
            defaultHeaders: { 'X-Anon-ID': getOrCreateAnonId(), ...requestIdHeader() },
            fetch: captureFetch as any,
        },
        ...extras,
    });
}

export function makeInternalLlm(model: string, extras: LlmExtras = {}): ChatOpenAI {
    if (process.env.OPENAI_API_KEY) {
        return new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY, ...extras });
    }

    const token = getAuthToken();
    const anonHeaders: Record<string, string> = token ? {} : { 'X-Anon-ID': getOrCreateAnonId() };

    return new ChatOpenAI({
        model,
        apiKey: token ?? 'anon',
        configuration: {
            baseURL: `${backendUrl()}/v1`,
            defaultHeaders: {
                ...anonHeaders,
                'X-Glitool-Internal': 'true',
                ...requestIdHeader(),
            },
        },
        ...extras,
    });
}
