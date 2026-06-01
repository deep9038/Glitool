import express from 'express';
import { validateToken } from '../middleware/validateToken.js';
import { checkUsageLimit, TOKEN_LIMITS } from '../middleware/checkUsageLimit.js';
import { Usage, AnonUsage } from '../models/index.js';
import { markCounted, wasAlreadyCounted } from '../lib/requestDedup.js';

const router = express.Router();

// Internal-only: classifier (always Qwen-7B, regardless of plan)
const CLASSIFIER_MODEL = 'Qwen/Qwen2.5-7B-Instruct-Turbo';

// Active vendor models on Together.ai
const QWEN_CODER = 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8';   // anon + free
const DEEPSEEK   = 'deepseek-ai/DeepSeek-V4-Pro';               // pro

// Fallback for unknown roles / legacy CLI hints
const DEFAULT_MODEL = QWEN_CODER;

type Plan = 'anon' | 'free' | 'pro';

const MODEL_TABLE: Record<string, Record<Plan, string>> = {
    'glitool/quick': {
        anon: QWEN_CODER,
        free: QWEN_CODER,
        pro:  DEEPSEEK,
    },
    'glitool/coder': {
        anon: QWEN_CODER,
        free: QWEN_CODER,
        pro:  DEEPSEEK,
    },
    'glitool/planner': {
        anon: QWEN_CODER,
        free: QWEN_CODER,
        pro:  DEEPSEEK,
    },
};

function resolvePlan(req: express.Request): Plan {
    return (req.user?.plan as Plan) ?? (req.anonUuid ? 'anon' : 'free');
}

function resolveModel(req: express.Request): string {
    if (req.headers['x-glitool-internal'] === 'true') return CLASSIFIER_MODEL;

    const plan = resolvePlan(req);
    const requested = (req.body?.model ?? '') as string;

    if (MODEL_TABLE[requested]) {
        return MODEL_TABLE[requested][plan] ?? DEFAULT_MODEL;
    }
    return MODEL_TABLE['glitool/quick'][plan] ?? DEFAULT_MODEL;
}


function logRequest(req: express.Request, resolvedModel: string, status: number, tokens: any, latencyMs: number): void {
    const entry = {
        t: new Date().toISOString().slice(11, 23),
        model_requested: req.body?.model ?? 'unknown',
        model_resolved:  resolvedModel,
        plan:            req.user?.plan ?? (req.anonUuid ? 'anon' : 'unknown'),
        internal:        req.headers['x-glitool-internal'] === 'true',
        status,
        tokens_in:       tokens?.prompt_tokens     ?? 0,
        tokens_out:      tokens?.completion_tokens ?? 0,
        latency_ms:      latencyMs,
    };
    console.log('[proxy]', JSON.stringify(entry));
    if (process.env.GLITOOL_DEV_MONITOR) {
        fetch('http://localhost:4000/event', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type:       'llm_response',
                model:      resolvedModel,
                plan:       req.user?.plan ?? (req.anonUuid ? 'anon' : 'unknown'),
                tokens_in:  tokens?.prompt_tokens ?? 0,
                tokens_out: tokens?.completion_tokens ?? 0,
                latency_ms: latencyMs,
                t:          new Date().toISOString(),
            }),
        }).catch(() => {});
    }
}


function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}


/**
 * Set headers the CLI uses to (a) know its plan for budget decisions,
 * (b) display remaining tokens in the StatusBar, (c) confirm which model
 * the server actually routed to.
 *
 * Internal classifier calls don't get user-facing headers — they don't
 * count against the user's budget.
 */
function setGlitoolHeaders(req: express.Request, res: express.Response, resolvedModel: string, addedTokens = 0): void {
    if (req.headers['x-glitool-internal'] === 'true') return;

    const plan = resolvePlan(req);
    const usage = (req as any).tokenUsage as { used: number; limit: number; tier: Plan } | undefined;
    const used  = (usage?.used  ?? 0) + addedTokens;
    const limit = usage?.limit  ?? TOKEN_LIMITS[plan];

    res.setHeader('X-Glitool-Resolved-Model', resolvedModel);
    res.setHeader('X-Glitool-Plan',           plan);
    res.setHeader('X-Glitool-Tokens-Used',    String(used));
    res.setHeader('X-Glitool-Tokens-Limit',   String(limit));
}


router.post('/chat/completions', validateToken, checkUsageLimit, async (req, res) => {
    const start = Date.now();
    const isStreaming   = req.body?.stream === true;
    const resolvedModel = resolveModel(req);

    const body = { ...req.body, model: resolvedModel, stream_options: { include_usage: true } };

    try {
        const response = await fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json();
            logRequest(req, resolvedModel, response.status, null, Date.now() - start);
            return res.status(response.status).json(error);
        }

        if (isStreaming && response.body) {
            res.setHeader('Content-Type',  'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection',    'keep-alive');
            // Set headers BEFORE first write — adjusted again at end with tokens added.
            setGlitoolHeaders(req, res, resolvedModel, 0);

            // Forward stream bytes unchanged AND parse SSE events to extract final usage.
            // Together emits a tail chunk with usage when stream_options.include_usage = true.
            const reader  = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer   = '';
            let lastUsage: any = null;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    res.write(chunk);

                    buffer += chunk;
                    const events = buffer.split('\n\n');
                    buffer = events.pop() ?? '';
                    for (const evt of events) {
                        if (!evt.startsWith('data: ')) continue;
                        const json = evt.slice(6).trim();
                        if (!json || json === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(json);
                            if (parsed.usage) lastUsage = parsed.usage;
                        } catch {}
                    }
                }
            } finally {
                if (!lastUsage) {
                    console.warn('[proxy] usage missing in stream — req_id:', req.headers['x-glitool-request-id'], 'model:', resolvedModel);
                }
                const tokens = (lastUsage?.prompt_tokens ?? 0) + (lastUsage?.completion_tokens ?? 0);
                logRequest(req, resolvedModel, 200, lastUsage, Date.now() - start);
                await trackUsage(req, tokens);
                res.end();
            }
        } else {
            const data = await response.json();
            if (!data?.usage) {
                console.warn('[proxy] usage missing in response — req_id:', req.headers['x-glitool-request-id'], 'model:', resolvedModel);
            }
            const tokens = (data?.usage?.prompt_tokens ?? 0) + (data?.usage?.completion_tokens ?? 0);
            setGlitoolHeaders(req, res, resolvedModel, tokens);
            logRequest(req, resolvedModel, 200, data.usage, Date.now() - start);
            await trackUsage(req, tokens);
            res.json(data);
        }
    } catch (err) {
        console.error('Proxy error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Proxy request failed' });
    }
});


/**
 * Add the call's actual token cost to the user's running total.
 *
 * Two counters, two policies — keyed off X-Glitool-Request-ID:
 *   - request_count: DEDUPED. One user prompt = one request, even though it spawns
 *     many ReAct iterations (each a separate /chat/completions call sharing the id).
 *   - tokens_used:   NOT deduped. Every iteration is real provider cost — each one
 *     re-sends the growing context and is billed separately by Together.ai. Counting
 *     only the first iteration undercounts agentic prompts by 10-40x.
 *
 * If token capture failed (tokens = 0) we still mark the id as counted so a retry of
 * the same prompt doesn't double-count request_count, but we skip the token $inc.
 */
async function trackUsage(req: express.Request, tokens: number) {
    const reqId = (req.headers['x-glitool-request-id'] as string) || '';
    const firstIteration = !reqId || !wasAlreadyCounted(reqId);
    if (reqId) markCounted(reqId);
    if (!Number.isFinite(tokens) || tokens <= 0) return;

    const inc: Record<string, number> = { tokens_used: tokens };
    if (firstIteration) inc.request_count = 1;

    try {
        if (req.anonUuid) {
            await AnonUsage.findOneAndUpdate(
                { uuid: req.anonUuid },
                { $inc: inc, last_seen: new Date() },
                { upsert: true }
            );
            return;
        }
        if (req.user) {
            await Usage.findOneAndUpdate(
                { user_id: req.user._id, month: currentMonth() },
                { $inc: inc },
                { upsert: true }
            );
        }
    } catch (err) {
        console.error('Usage tracking error:', err);
    }
}

export default router;
