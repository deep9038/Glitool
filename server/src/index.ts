import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
const app = express();
const PORT = process.env.PORT ?? 3000;

const allowedOrigins = process.env.CLIENT_URL
    ? [process.env.CLIENT_URL, 'https://glit.in', 'https://www.glit.in']
    : ['https://glit.in', 'https://www.glit.in'];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/auth', authRouter);
app.use('/v1', proxyRouter);
app.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

async function start() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Glitool server running on port ${PORT}`);
    });
}

start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
