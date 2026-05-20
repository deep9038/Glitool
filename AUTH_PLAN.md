# Glitool — Auth & Backend Plan

## Overview

Move Glitool from "bring your own OpenAI key" to a managed platform.
Users register once, authenticate through the CLI, and all LLM calls route through
Glitool's backend. Glitool owns the OpenAI API key — users never touch it.

Business model: **freemium** (daily limit TBD, ~10 chats/day free tier).

---

## User Experience

### First run (new user)
```
$ glitool

  Welcome to Glitool
  You need an account to continue.

  Open this URL in your browser:
  → https://glitool.dev/activate

  Your code: ABC-123  (expires in 5 minutes)

  Waiting for authentication...  ◑
```

User opens browser → logs in with GitHub or Google → enters code ABC-123 → done.
CLI detects completion automatically, no copy-paste needed.

```
  ✓ Authenticated as deep22sarkar@gmail.com
  Starting Glitool...
```

### Returning user
Token is saved in `~/.glitool/auth.json`. No prompt on next launch.

### Token expired
Same flow as first run. User re-authenticates silently.

---

## Auth Flow (Device Code — Option B)

Identical to how GitHub CLI (`gh auth login`) works.

```
CLI                        Backend                    Browser
 │                            │                           │
 ├─ POST /auth/device ────────►                           │
 │◄─ { device_code,           │                           │
 │     user_code: "ABC-123",  │                           │
 │     expires_in: 300 }      │                           │
 │                            │                           │
 │  show URL + code to user   │                           │
 │                            │                           │
 ├─ GET /auth/device/poll ────► (every 5s)                │
 │◄─ { status: "pending" }    │                           │
 │                            │                           │
 │                            │◄── user opens /activate ──┤
 │                            │◄── GitHub/Google OAuth ───┤
 │                            │    callback               │
 │                            │    create user + token    │
 │                            │    mark device_code done  │
 │                            │                           │
 ├─ GET /auth/device/poll ────►                           │
 │◄─ { status: "complete",    │                           │
 │     access_token: "glt_…"} │                           │
 │                            │                           │
 │  save token to disk        │                           │
 │  start normally            │                           │
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  User's Machine                                     │
│                                                     │
│  glitool (CLI)                                      │
│  ├── ~/.glitool/auth.json   ← stores access token   │
│  └── all LLM calls → Glitool Backend                │
└─────────────────────────────────────────────────────┘
                          │
                          │ HTTPS + Bearer token
                          ▼
┌─────────────────────────────────────────────────────┐
│  Glitool Backend  (server/)                         │
│                                                     │
│  ├── Auth routes    /auth/*                         │
│  ├── LLM proxy      /v1/chat/completions            │
│  ├── Token validate middleware                      │
│  ├── Usage tracking (daily limit)                   │
│  └── SQLite database                                │
└─────────────────────────────────────────────────────┘
                          │
                          │ OpenAI API key (Glitool's)
                          ▼
                       OpenAI
```

---

## What Gets Built

### 1. CLI changes (`CLI/`)

**New file: `src/auth.ts`**
- Check `~/.glitool/auth.json` for a valid token on startup
- If missing or expired → trigger device code flow
- Poll backend every 5 seconds until auth completes
- Save token to disk

**New file: `src/ui/AuthFlow.tsx`**
- Ink component shown during registration
- Displays URL, user code, and animated waiting spinner
- Shows success/error state

**Modified: `src/agent.ts` and all agent files**
- Replace `apiKey: process.env.OPENAI_API_KEY` with Glitool token
- Replace OpenAI base URL with Glitool backend URL
- LangChain's `ChatOpenAI` accepts `configuration.baseURL` — so agent code
  stays the same, only the base URL and key source change

```ts
// Before
new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY })

// After
new ChatOpenAI({
    model,
    apiKey: getAuthToken(),           // reads from ~/.glitool/auth.json
    configuration: {
        baseURL: 'https://api.glitool.dev/v1'
    }
})
```

Because the backend implements an OpenAI-compatible endpoint, **no changes
are needed in any agent file** (coder, reviewer, debugger, etc.).

---

### 2. Backend (`server/`)

**Tech stack:** TypeScript + Node.js + Express + better-sqlite3

**Database tables:**

```sql
users
  id          TEXT PRIMARY KEY   -- UUID
  email       TEXT UNIQUE
  github_id   TEXT UNIQUE
  google_id   TEXT UNIQUE
  name        TEXT
  created_at  TEXT

access_tokens
  token       TEXT PRIMARY KEY   -- "glt_" + random
  user_id     TEXT
  created_at  TEXT
  expires_at  TEXT               -- NULL = never expires (for now)

device_codes
  device_code TEXT PRIMARY KEY   -- random, sent to CLI
  user_code   TEXT               -- "ABC-123", shown to user
  user_id     TEXT               -- NULL until claimed
  access_token TEXT              -- filled when claimed
  status      TEXT               -- pending | complete | expired
  created_at  TEXT
  expires_at  TEXT

usage
  user_id     TEXT
  date        TEXT               -- "2026-05-20"
  chat_count  INTEGER
```

**API routes:**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/device` | Generate device code + user code for CLI |
| GET | `/auth/device/poll` | CLI polls this until auth completes |
| GET | `/auth/github` | Redirect to GitHub OAuth |
| GET | `/auth/github/callback` | GitHub OAuth callback |
| GET | `/auth/google` | Redirect to Google OAuth |
| GET | `/auth/google/callback` | Google OAuth callback |
| POST | `/v1/chat/completions` | OpenAI-compatible proxy (auth required) |

**Middleware:**
- Token validation on every `/v1/*` route
- Daily usage check — reject with `402` when limit reached
- Rate limiting on `/auth/device` (prevent abuse)

---

### 3. Website (`client/`)

**Tech stack:** Next.js (already planned)

**Pages:**

| Page | Purpose |
|------|---------|
| `/activate` | Enter device code + login with GitHub/Google |
| `/dashboard` | Usage stats, account info (future) |
| `/pricing` | Free vs paid tiers (future) |

**`/activate` flow:**
1. User lands on page
2. Clicks "Continue with GitHub" or "Continue with Google"
3. OAuth completes → user is logged in
4. Page asks for device code (the "ABC-123" shown in terminal)
5. User enters code → backend links device to account
6. Page shows "You're connected. Go back to your terminal."

---

## File Structure After Build

```
Glitool/
├── CLI/
│   └── src/
│       ├── auth.ts              ← NEW: token storage + device flow
│       ├── ui/
│       │   └── AuthFlow.tsx     ← NEW: registration UI
│       └── agent.ts             ← MODIFIED: use Glitool backend URL
│
├── server/
│   ├── src/
│   │   ├── index.ts             ← Express app entry
│   │   ├── db.ts                ← SQLite setup
│   │   ├── routes/
│   │   │   ├── auth.ts          ← /auth/* routes
│   │   │   └── proxy.ts         ← /v1/chat/completions
│   │   └── middleware/
│   │       ├── validateToken.ts
│   │       └── usageLimit.ts
│   ├── package.json
│   └── tsconfig.json
│
└── client/
    ├── app/
    │   └── activate/
    │       └── page.tsx         ← device code entry page
    ├── package.json
    └── next.config.ts
```

---

## Open Decisions

These need answers before building starts:

| Question | Options | Status |
|----------|---------|--------|
| Domain name | glitool.dev, useglitool.com, ? | ❓ undecided |
| OAuth providers | GitHub only first, then Google | ❓ undecided |
| Backend hosting | Railway, Render, Vercel, VPS | ❓ undecided |
| Free tier limit | ~10 chats/day mentioned | ❓ to confirm |
| Paid tier pricing | TBD | ⏳ later |
| Token expiry | Never, 30 days, 90 days | ❓ undecided |

---

## Build Order

1. **Backend first** — auth routes + database + OpenAI proxy
2. **Website `/activate` page** — GitHub OAuth + device code claim
3. **CLI auth module** — device flow + token storage
4. **CLI agent wiring** — swap base URL + key source
5. **Test end-to-end** — install fresh, go through full registration flow
6. **Deploy** — backend + website live
7. **Publish CLI** — bump to `2.0.0` (breaking change: requires account)

---

## Notes

- The OpenAI-compatible proxy approach means **zero changes to any agent file**.
  All LangChain tool calls, streaming, and model selection work identically —
  only the destination URL changes.
- SQLite is fine for early users. Migrate to Postgres when scale requires it.
- GitHub OAuth only is recommended for the first release — simpler OAuth app
  setup, and developers are already on GitHub.
- Consider keeping `OPENAI_API_KEY` as a local override for power users who
  want to bring their own key — set `configuration.baseURL` only when no local
  key is found.
