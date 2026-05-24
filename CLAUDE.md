# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Structure

Three sub-projects:

- `CLI/` — TypeScript CLI, published to npm as `glitool` (currently v2.0.2)
- `client/` — Next.js website (separate repo: github.com/deep9038/glitoolCient), deployed to https://glit.in via Vercel
- `server/` — Express + MongoDB Atlas, deployed to https://api.glit.in on a DigitalOcean droplet

## CLI (in `CLI/`)

### Commands

```bash
cd CLI
npm run dev          # tsx, no build
npm run build        # compile to dist/
npm install -g .     # reinstall globally (regenerates glitool.cmd on Windows)
npm publish          # release to npm
```

### Running

```
glitool              # interactive chat session
```

### Key architecture

- Entry: `src/index.tsx` (Ink + commander)
- Auth: `src/auth.ts` — anonymous UUID, GitHub OAuth via device code flow, BYOK fallback
- LLM factory: `src/llm/factory.ts` — routes through `api.glit.in/v1` (Glitool backend) or directly to OpenAI when `OPENAI_API_KEY` is set
- Routing: `src/llm/router.ts` — regex + LLM classifier picks 1 of 8 domains
- Agents: `src/agents/*` — domain-specific handlers, all use `makeLlm()` lazily (created per chat call, not at module load — required for request_id dedup)
- Tools: `src/tools/*` — readFile, writeFile, editFile, bash, listFiles, searchCode, webFetch
- Conversation history persisted in `~/.glitool/sessions/`
- Auth state in `~/.glitool/auth.json` (post-signup) and `~/.glitool/anon.json` (anonymous)

### Three auth modes

1. **Anonymous (default)** — local UUID in `~/.glitool/anon.json`, 5 requests, X-Anon-ID header
2. **Free tier (signed in)** — GitHub OAuth → `glt_` Bearer token in `~/.glitool/auth.json`, 50 req/month
3. **BYOK** — `OPENAI_API_KEY` env var → bypasses Glitool backend, calls OpenAI directly with OpenAI model names

### Module system

ESM (`"type": "module"`, `"module": "NodeNext"`). Local imports must use `.js` extension even for `.ts` files.

### Windows gotcha

After `npm run build`, always `npm install -g .` to regenerate `glitool.cmd`.

## Server (in `server/`)

- `src/index.ts` — Express app, CORS for glit.in/www.glit.in, mounts `/auth` and `/v1`
- `src/routes/auth.ts` — device code flow + GitHub OAuth callback
- `src/routes/proxy.ts` — OpenAI-compatible proxy that forwards to Together.ai with tier-based model resolution
- `src/middleware/validateToken.ts` — checks Bearer token or X-Anon-ID
- `src/middleware/checkUsageLimit.ts` — enforces ANON_LIMIT (8) and FREE_LIMIT (50). Bypasses count when X-Glitool-Internal=true.
- `src/lib/requestDedup.ts` — in-memory Map with 5-min TTL. Each unique `X-Glitool-Request-ID` only counts once, even if it spawns many ReAct iterations.
- `src/models/index.ts` — Mongoose models: User, AccessToken, DeviceCode, Usage, AnonUsage, Subscription

### Together.ai model assignments (server/src/routes/proxy.ts)

| Constant | Value | Tier |
|---|---|---|
| `CLASSIFIER_MODEL` | `Qwen/Qwen2.5-7B-Instruct-Turbo` | Internal routing |
| `DEFAULT_MODEL` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Anon + Free general + Pro general |
| `CODING_MODEL` | `openai/gpt-oss-20b` | Free coding, Pro coding |
| `PLANNING_MODEL` | `openai/gpt-oss-120b` | Pro planning + review |

These were chosen after testing — the originally planned models (Llama-3.2-3B, Qwen2.5-Coder-72B, DeepSeek-V3) became non-serverless on Together.ai. See LLM_STRATEGY.md.

### Deploying server changes

```bash
# On the droplet (139.59.20.186)
cd /var/www/Glitool && git pull
cd server && npm run build && pm2 restart glitool-server
pm2 logs glitool-server --lines 10 --nostream
```

### Server environment (`server/.env`)

Required variables: `PORT`, `MONGO_URI`, `CLIENT_URL=https://glit.in`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOGETHER_API_KEY`.

## Client (in `client/`, separate repo `glitoolCient`)

Next.js 16. Deployed to https://glit.in via Vercel. Set `NEXT_PUBLIC_BACKEND_URL=https://api.glit.in`. Has `/activate` page that handles the device code OAuth flow.

## Production URLs

- Backend: https://api.glit.in
- Website: https://glit.in (root + /activate)
- npm package: https://www.npmjs.com/package/glitool
- GitHub OAuth callback: https://api.glit.in/auth/github/callback

## Important conventions

- **Never commit secrets.** Several were leaked historically in DEPLOYMENT.md and have been rotated. `CLI/.env` is gitignored.
- **Lazy LLM creation.** All `makeLlm()` calls should be inside the exported function, not at module level. Module-level LLMs miss the per-request `X-Glitool-Request-ID` and break the dedup counter.
- **CLI sends `X-Glitool-Request-ID`.** Set once at top of `chat()` via `startNewRequest()`, shared across all LLM calls within one user prompt.
- **Server enforces limits via MongoDB + dedup cache.** AnonUsage / Usage collections track counts. requestDedup.ts ensures 1 user prompt = 1 increment.
