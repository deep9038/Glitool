import { Request, Response, NextFunction } from 'express';
import { Usage, AnonUsage } from '../models/index.js';

const FREE_LIMIT = 50;
const ANON_LIMIT = 5;

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

export async function checkUsageLimit(req: Request, res: Response, next: NextFunction) {
    if (req.headers['x-glitool-internal'] === 'true') {
        return next();
    }
    if (req.anonUuid) {
        const anon = await AnonUsage.findOne({ uuid: req.anonUuid });
        if ((anon?.request_count ?? 0) >= ANON_LIMIT) {
            return res.status(402).json({
                error: 'anon_limit',
                message: 'Sign in with GitHub for 50 free requests/month',
                signup_url: `${process.env.CLIENT_URL}/activate`,
            });
        }
        return next();
    }

    const user = req.user!;
    if (user.plan === 'pro') return next();

    const usage = await Usage.findOne({ user_id: user._id, month: currentMonth() });
    if ((usage?.request_count ?? 0) >= FREE_LIMIT) {
        return res.status(402).json({
            error: 'monthly_limit',
            message: `Free tier limit reached (${FREE_LIMIT} requests/month)`,
            upgrade_url: `${process.env.CLIENT_URL}/upgrade`,
        });
    }

    next();
}
