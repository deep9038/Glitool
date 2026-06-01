import { Request, Response, NextFunction } from 'express';
import { Usage, AnonUsage } from '../models/index.js';
import { wasAlreadyCounted } from '../lib/requestDedup.js';

export const TOKEN_LIMITS: Record<'anon' | 'free' | 'pro', number> = {
    anon:       150_000,      // lifetime — one realistic agentic prompt is ~60k, so this gives ~2-3
    free:       500_000,      // monthly
    pro:      3_000_000,      // monthly hard cap
};

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

export async function checkUsageLimit(req: Request, res: Response, next: NextFunction) {
    if (req.headers['x-glitool-internal'] === 'true') return next();

    // ReAct iterations within a single user prompt share a request id — only the
    // first iteration runs the cap check, the rest get a free pass.
    const reqId = (req.headers['x-glitool-request-id'] as string) || '';
    if (reqId && wasAlreadyCounted(reqId)) return next();

    let used  = 0;
    let limit = 0;
    let tier: 'anon' | 'free' | 'pro' = 'anon';

    if (req.anonUuid) {
        const anon = await AnonUsage.findOne({ uuid: req.anonUuid });
        used  = anon?.tokens_used ?? 0;
        limit = TOKEN_LIMITS.anon;
        tier  = 'anon';
    } else if (req.user) {
        const plan = (req.user.plan === 'pro' ? 'pro' : 'free') as 'free' | 'pro';
        const usage = await Usage.findOne({ user_id: req.user._id, month: currentMonth() });
        used  = usage?.tokens_used ?? 0;
        limit = TOKEN_LIMITS[plan];
        tier  = plan;
    } else {
        return next();
    }

    if (used >= limit) {
        const message =
            tier === 'anon' ? 'Lifetime allowance reached. Run /signup to get 500k more tokens / month.' :
            tier === 'free' ? 'Monthly free allowance reached. Upgrade to Pro for 3M tokens / month.' :
                              'Monthly Pro allowance reached.';
        return res.status(429).json({
            error:        'token_limit_exceeded',
            tier,
            tokens_used:  used,
            tokens_limit: limit,
            message,
            ...(tier === 'anon' ? { signup_url:  `${process.env.CLIENT_URL}/activate` } : {}),
            ...(tier === 'free' ? { upgrade_url: `${process.env.CLIENT_URL}/upgrade` } : {}),
        });
    }

    // Forward usage + limit to proxy.ts so it can write the response headers
    (req as any).tokenUsage = { used, limit, tier };
    next();
}
