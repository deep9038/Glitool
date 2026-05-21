import express from 'express';
import crypto from 'crypto';
import { DeviceCode, User, AccessToken, Usage } from '../models/index.js';

const router = express.Router();

function randomHex(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
}

function generateUserCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        if (i === 3) code += '-';
        code += chars[crypto.randomInt(chars.length)];
    }
    return code;
}

function generateAccessToken(): string {
    return 'glt_' + randomHex(32);
}

function currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

// POST /auth/device — CLI calls this to start sign-in
router.post('/device', async (_req, res) => {
    try {
        const device_code = randomHex(32);
        const user_code   = generateUserCode();
        const expires_at  = new Date(Date.now() + 5 * 60 * 1000);

        await DeviceCode.create({ device_code, user_code, expires_at });

        res.json({
            device_code,
            user_code,
            expires_in: 300,
            verification_uri: `${process.env.CLIENT_URL}/activate`,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create device code' });
    }
});

// GET /auth/device/poll?device_code=xxx — CLI polls every 5s
router.get('/device/poll', async (req, res) => {
    const { device_code } = req.query;
    if (!device_code || typeof device_code !== 'string') {
        return res.status(400).json({ error: 'device_code required' });
    }

    const doc = await DeviceCode.findOne({ device_code });
    if (!doc) return res.status(404).json({ error: 'Invalid device code' });

    if (doc.status === 'pending' && new Date() > doc.expires_at) {
        doc.status = 'expired';
        await doc.save();
    }

    if (doc.status === 'expired') return res.json({ status: 'expired' });
    if (doc.status === 'pending') return res.json({ status: 'pending' });

    const user = await User.findById(doc.user_id);
    if (!user) return res.status(500).json({ error: 'User not found' });

    const usage = await Usage.findOne({ user_id: user._id, month: currentMonth() });
    const requests_remaining = user.plan === 'pro'
        ? null
        : Math.max(0, 50 - (usage?.request_count ?? 0));
    const reset_date = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1, 1
    ).toISOString();

    return res.json({
        status: 'complete',
        access_token: doc.access_token,
        plan: user.plan,
        email: user.email,
        requests_remaining,
        reset_date,
    });
});

// GET /auth/github?user_code=ABC-123 — redirect to GitHub OAuth
router.get('/github', (req, res) => {
    const { user_code } = req.query;
    if (!user_code) return res.status(400).send('user_code required');

    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID!,
        scope: 'user:email',
        state: String(user_code),
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /auth/github/callback — GitHub redirects here after login
router.get('/github/callback', async (req, res) => {
    const { code, state: user_code } = req.query;
    if (!code || !user_code) return res.status(400).send('Missing code or state');

    try {
        // Exchange code for GitHub token
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id:     process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });
        const tokenData = await tokenRes.json() as any;
        const githubToken = tokenData.access_token;
        if (!githubToken) return res.status(400).send('GitHub auth failed');

        // Fetch GitHub profile
        const profileRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${githubToken}`, 'User-Agent': 'glitool' },
        });
        const profile = await profileRes.json() as any;

        // Fetch primary email if not public
        let email = profile.email;
        if (!email) {
            const emailsRes = await fetch('https://api.github.com/user/emails', {
                headers: { Authorization: `Bearer ${githubToken}`, 'User-Agent': 'glitool' },
            });
            const emails = await emailsRes.json() as any[];
            email = emails.find((e: any) => e.primary && e.verified)?.email ?? emails[0]?.email;
        }
        if (!email) return res.status(400).send('Could not get email from GitHub');

        // Upsert user
        const user = await User.findOneAndUpdate(
            { github_id: String(profile.id) },
            { email, github_username: profile.login, name: profile.name ?? profile.login },
            { upsert: true, new: true }
        );

        // Generate Glitool access token (90 days)
        const access_token = generateAccessToken();
        const expires_at   = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        await AccessToken.create({ token: access_token, user_id: user._id, expires_at });

        // Mark device code complete
        await DeviceCode.findOneAndUpdate(
            { user_code: String(user_code), status: 'pending' },
            { status: 'complete', user_id: user._id, access_token }
        );

        res.redirect(`${process.env.CLIENT_URL}/activate?success=true`);

    } catch (err) {
        console.error('GitHub callback error:', err);
        res.status(500).send('Authentication failed');
    }
});

export default router;
