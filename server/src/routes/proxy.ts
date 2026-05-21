import express from 'express';
import { validateToken } from '../middleware/validateToken.js';
import { checkUsageLimit } from '../middleware/checkUsageLimit.js';
import { Usage, AnonUsage } from '../models/index.js';

const router = express.Router();

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

router.post('/chat/completions', validateToken, checkUsageLimit, async (req, res) => {
    const isStreaming = req.body?.stream === true;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body),
        });

        if (!response.ok) {
            const error = await response.json();
            return res.status(response.status).json(error);
        }

        if (isStreaming && response.body) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(decoder.decode(value, { stream: true }));
                }
            } finally {
                res.end();
            }
        } else {
            const data = await response.json();
            res.json(data);
        }

        await trackUsage(req);

    } catch (err) {
        console.error('Proxy error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Proxy request failed' });
    }
});

async function trackUsage(req: express.Request) {
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
