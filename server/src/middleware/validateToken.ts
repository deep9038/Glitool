import { Request, Response, NextFunction } from 'express';
import { AccessToken, User } from '../models/index.js';

export async function validateToken(req: Request, res: Response, next: NextFunction) {
    const anonId = req.headers['x-anon-id'];
    if (anonId && typeof anonId === 'string') {
        req.anonUuid = anonId;
        return next();
    }

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = auth.slice(7);
    const tokenDoc = await AccessToken.findOne({ token });
    if (!tokenDoc) return res.status(401).json({ error: 'Invalid token' });
    if (new Date() > tokenDoc.expires_at) return res.status(401).json({ error: 'Token expired' });

    const user = await User.findById(tokenDoc.user_id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user;
    next();
}
