import { ChatOpenAI } from '@langchain/openai';
import { getAuthToken, getOrCreateAnonId } from '../auth.js';

// const BACKEND_URL = process.env.GLITOOL_BACKEND ?? 'http://localhost:3000';
const BACKEND_URL = process.env.GLITOOL_BACKEND ?? 'https://api.glit.in';

interface LlmExtras {
    temperature?:  number;
    modelKwargs?:  Record<string, unknown>;
    streaming?:    boolean;
}

export function makeLlm(model: string, extras: LlmExtras = {}): ChatOpenAI {
    // BYOK: local key bypasses the Glitool backend entirely
    if (process.env.OPENAI_API_KEY) {
        return new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY, ...extras });
    }

    const token = getAuthToken();
    if (token) {
        return new ChatOpenAI({
            model,
            apiKey: token,
            configuration: { baseURL: `${BACKEND_URL}/v1` },
            ...extras,
        });
    }

    // Anonymous trial — backend validates via X-Anon-ID header
    return new ChatOpenAI({
        model,
        apiKey: 'anon',
        configuration: {
            baseURL: `${BACKEND_URL}/v1`,
            defaultHeaders: { 'X-Anon-ID': getOrCreateAnonId() },
        },
        ...extras,
    });
}




export function makeInternalLlm(model: string, extras: LlmExtras = {}): ChatOpenAI {
    if (process.env.OPENAI_API_KEY) {
        return new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY, ...extras });
    }

    const token = getAuthToken();
    const anonHeaders: Record<string, string> = token
        ? {}
        : { 'X-Anon-ID': getOrCreateAnonId() };

    return new ChatOpenAI({
        model,
        apiKey: token ?? 'anon',
        configuration: {
            baseURL: `${BACKEND_URL}/v1`,
            defaultHeaders: {
                ...anonHeaders,
                'X-Glitool-Internal': 'true',
            },
        },
        ...extras,
    });
}