import { ChatOpenAI } from '@langchain/openai';
import { randomUUID } from 'crypto';
import { getAuthToken, getOrCreateAnonId } from '../auth.js';

function backendUrl(): string {
    return process.env.GLITOOL_BACKEND ?? 'https://api.glit.in';
}

let currentRequestId: string | null = null;

export function startNewRequest(): string {
    currentRequestId = randomUUID();
    return currentRequestId;
}

function requestIdHeader(): Record<string, string> {
    return currentRequestId ? { 'X-Glitool-Request-ID': currentRequestId } : {};
}

interface LlmExtras {
    temperature?:  number;
    modelKwargs?:  Record<string, unknown>;
    streaming?:    boolean;
}

export function makeLlm(model: string, extras: LlmExtras = {}): ChatOpenAI {
    if (process.env.OPENAI_API_KEY) {
        return new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY,streaming: true, ...extras });
    }

    const token = getAuthToken();
    if (token) {
        return new ChatOpenAI({
            model,
            apiKey: token,
            streaming: true,
            configuration: {
                baseURL: `${backendUrl()}/v1`,
                defaultHeaders: requestIdHeader(),
            },
            ...extras,
        });
    }

    return new ChatOpenAI({
        model,
        apiKey: 'anon',
        streaming: true,
        configuration: {
            baseURL: `${backendUrl()}/v1`,
            defaultHeaders: { 'X-Anon-ID': getOrCreateAnonId(), ...requestIdHeader() },
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
