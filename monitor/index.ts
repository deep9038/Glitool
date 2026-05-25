import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 4000;
const clients: express.Response[] = [];
const events: any[] = [];

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.post('/event', (req, res) => {
    const event = { ...req.body, id: Date.now() };
    events.push(event);
    clients.forEach(c => { try { c.write(`data: ${JSON.stringify(event)}\n\n`); } catch {} });
    res.json({ ok: true });
});

app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    events.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
    clients.push(res);
    req.on('close', () => { const i = clients.indexOf(res); if (i !== -1) clients.splice(i, 1); });
});

app.delete('/events', (_req, res) => {
    events.length = 0;
    clients.forEach(c => { try { c.write(`data: ${JSON.stringify({ type: 'clear' })}\n\n`); } catch {} });
    res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Glitool Monitor → http://localhost:${PORT}`));
