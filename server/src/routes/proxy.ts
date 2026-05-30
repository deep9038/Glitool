import express from 'express';
import { validateToken } from '../middleware/validateToken.js';
import { checkUsageLimit } from '../middleware/checkUsageLimit.js';
import { Usage, AnonUsage } from '../models/index.js';
import { markCounted, wasAlreadyCounted } from '../lib/requestDedup.js';

const router = express.Router();

// Internal-only: classifier (always Qwen, regardless of plan)
const CLASSIFIER_MODEL = 'Qwen/Qwen2.5-7B-Instruct-Turbo';

// Active vendor models on Together.ai
const MINIMAX  = 'MiniMaxAI/MiniMax-M2.7';
const DEEPSEEK = 'deepseek-ai/DeepSeek-V4-Pro';
const KIMI     = 'moonshotai/Kimi-K2.6';   // reserved for future glitool/multimodal

// Fallback for unknown roles / legacy CLI hints
const DEFAULT_MODEL = MINIMAX;

type Plan = 'anon' | 'free' | 'pro';

const MODEL_TABLE: Record<string, Record<Plan, string>> = {
    'glitool/quick': {
        anon: MINIMAX,
        free: MINIMAX,
        pro:  MINIMAX,
    },
    'glitool/coder': {
        anon: MINIMAX,
        free: DEEPSEEK,
        pro:  DEEPSEEK,
    },
    'glitool/planner': {
        anon: MINIMAX,
        free: DEEPSEEK,
        pro:  DEEPSEEK,
    },
    'glitool/multimodal': {
        anon: KIMI,
        free: KIMI,
        pro:  KIMI,
    },
};

function resolveModel(req: express.Request): string {
    // Internal routing/classifier calls bypass the table entirely
    if (req.headers['x-glitool-internal'] === 'true') return CLASSIFIER_MODEL;

    const plan: Plan = (req.user?.plan as Plan) ?? (req.anonUuid ? 'anon' : 'free');
    const requested = (req.body?.model ?? '') as string;

    // Known role → table lookup
    if (MODEL_TABLE[requested]) {
        return MODEL_TABLE[requested][plan] ?? DEFAULT_MODEL;
    }

    // Legacy CLI hint (vendor name) or unknown role — fall back to the plan's quick model
    return MODEL_TABLE['glitool/quick'][plan] ?? DEFAULT_MODEL;
}




function logRequest(req: express.Request, resolvedModel: string, status: number, tokens: any, latencyMs: number): void {
    const entry = {
        t: new Date().toISOString().slice(11, 23),
        model_requested: req.body?.model ?? 'unknown',
        model_resolved: resolvedModel,
        plan: req.user?.plan ?? (req.anonUuid ? 'anon' : 'unknown'),
        internal: req.headers['x-glitool-internal'] === 'true',
        status,
        tokens_in:  tokens?.prompt_tokens     ?? 0,
        tokens_out: tokens?.completion_tokens ?? 0,
        latency_ms: latencyMs,
    };
    console.log('[proxy]', JSON.stringify(entry));
    if (process.env.GLITOOL_DEV_MONITOR) {
        fetch('http://localhost:4000/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'llm_response',
                model: resolvedModel,
                plan: req.user?.plan ?? (req.anonUuid ? 'anon' : 'unknown'),
                tokens_in: tokens?.prompt_tokens ?? 0,
                tokens_out: tokens?.completion_tokens ?? 0,
                latency_ms: latencyMs,
                t: new Date().toISOString(),
            }),
        }).catch(() => {});
    }
}







function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

router.post('/chat/completions', validateToken, checkUsageLimit, async (req, res) => {
    const start = Date.now();
    const isStreaming = req.body?.stream === true;
    const resolvedModel = resolveModel(req);

    const body = { ...req.body, model: resolvedModel, stream_options: { include_usage: true } };


    try {
        const response = await fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.json();
            logRequest(req, resolvedModel, response.status, null, Date.now() - start);
            return res.status(response.status).json(error);
        }

        if (isStreaming && response.body) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Glitool-Resolved-Model', resolvedModel);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(decoder.decode(value, { stream: true }));
                }
            } finally {
                logRequest(req, resolvedModel, 200, null, Date.now() - start);
                res.end();
            }
        } else {
            const data = await response.json();
            res.setHeader('X-Glitool-Resolved-Model', resolvedModel);
            logRequest(req, resolvedModel, 200, data.usage, Date.now() - start);
            res.json(data);
        }

        await trackUsage(req);

    } catch (err) {
        console.error('Proxy error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Proxy request failed' });
    }
});

async function trackUsage(req: express.Request) {
    const reqId = (req.headers['x-glitool-request-id'] as string) || '';
    if (reqId && wasAlreadyCounted(reqId)) return;
    if (reqId) markCounted(reqId);

    try {
        if (req.anonUuid) {
            await AnonUsage.findOneAndUpdate(
                { uuid: req.anonUuid },
                { $inc: { request_count: 1 }, last_seen: new Date() },
                { upsert: true }
            );
            return;
        }
        if (req.user) {
            await Usage.findOneAndUpdate(
                { user_id: req.user._id, month: currentMonth() },
                { $inc: { request_count: 1 } },
                { upsert: true }
            );
        }
    } catch (err) {
        console.error('Usage tracking error:', err);
    }
}

export default router;
