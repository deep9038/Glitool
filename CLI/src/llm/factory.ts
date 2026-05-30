import { ChatOpenAI } from '@langchain/openai';
import { randomUUID } from 'crypto';
import { getAuthToken, getOrCreateAnonId } from '../auth.js';

function backendUrl(): string {
    return process.env.GLITOOL_BACKEND ?? 'https://api.glit.in';
}

let currentRequestId: string | null = null;
const resolvedModelByRequest = new Map<string, string>();

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

function requestIdHeader(): Record<string, string> {
    return currentRequestId ? { 'X-Glitool-Request-ID': currentRequestId } : {};
}

// Wraps fetch to capture the X-Glitool-Resolved-Model header from every server response.
// requestId is bound at LLM construction time so concurrent requests stay disjoint.
function makeCaptureFetch(requestId: string | null): typeof fetch {
    return async (input, init) => {
        const response = await fetch(input as any, init);
        try {
            const resolved = response.headers.get('X-Glitool-Resolved-Model');
            if (resolved && requestId) {
                resolvedModelByRequest.set(requestId, resolved);
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
