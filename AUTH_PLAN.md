# Glitool — Auth & Backend Plan

## Overview

Move Glitool from "bring your own OpenAI key" to a managed platform.
Users authenticate with GitHub, and all LLM calls route through Glitool's
backend. Glitool owns the OpenAI API key — users never touch it.

Business model: **freemium**
- Anonymous trial: 5 requests, no sign-in required (tracked by local UUID)
- Free tier: 50 requests/month after GitHub OAuth
- Pro tier: $12/month — unlimited requests

---

## Pricing Rationale

| | Anonymous | Free | Pro |
|--|-----------|------|-----|
| Sign-in | None | GitHub | GitHub |
| Requests | 5 lifetime | 50/month | Unlimited |
| Models | All tiers | All tiers | All tiers |
| Memory | ✓ | ✓ | ✓ |
| Price | $0 | $0 | $12/month |

**Why 5 anonymous requests:**
Zero friction on first run. User installs, types glitool, and it just works.
No sign-in wall before they've seen any value. After 5 requests they're
hooked enough to click "Continue with GitHub."

Anonymous usage is tracked by a local UUID in `~/.glitool/anon.json`.
Abuse risk is negligible — the target user is a developer, not someone
who will hunt down a hidden dotfile and delete it every 5 requests just
to avoid a one-click GitHub login.

**Why monthly, not daily:**
Daily limits frustrate developers mid-session. Monthly limits let users
burst when they need it (big refactor day) and go light other days.
50 requests/month is enough to seriously evaluate the tool — not enough
to replace paid tooling long term.

**Why $12/month:**
- Below Cursor ($20), competitive with Copilot ($10–19)
- Your cost at heavy usage ≈ $3–5/user/month (gpt-4o-mini)
- $7–9 margin covers infrastructure + free tier subsidy

---

## User Experience

### First run (new user — anonymous)
```
$ glitool

  Welcome to Glitool  ·  5 free requests, no sign-in needed.
  Type /signup anytime to unlock 50 requests/month free.
```

User just starts using it. No prompt, no friction.

After each anonymous request, a subtle counter appears in the status bar:
```
  ■idle    gpt-4o-mini · 1.2k tokens · $0.001    4 free requests left
```

### After 5th anonymous request
```
  You've used your 5 free requests.
  Sign in with GitHub — free, 50 requests/month:

  → https://glit.in/activate
  Code: ABC-123  (expires in 5 minutes)

  Waiting...  ◑
```

User clicks "Continue with GitHub" → enters ABC-123 → done.

```
  ✓ Signed in as deep22sarkar@gmail.com  (free · 50 req/month)
  Starting Glitool...
```

### Returning user
Token saved in `~/.glitool/auth.json`. No prompt on next launch.

### Free tier limit hit
```
  ✗ Monthly limit reached (50/50 requests used)

  Upgrade to Pro for unlimited access:
  → https://glit.in/upgrade

  Or wait until June 1 for your limit to reset.
```

### Token expired (after 90 days)
Same flow as first run. Single click re-auth.

---

## Auth Flow (Device Code — same as `gh auth login`)

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
 │                            │◄── GitHub OAuth callback ─┤
 │                            │    create/find user        │
 │                            │    generate access token   │
 │                            │    mark device_code done   │
 │                            │                           │
 ├─ GET /auth/device/poll ────►                           │
 │◄─ { status: "complete",    │                           │
 │     access_token: "glt_…", │                           │
 │     plan: "free",          │                           │
 │     requests_remaining: 50}│                           │
 │                            │                           │
 │  save to ~/.glitool/auth.json                          │
 │  start normally            │                           │
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  User's Machine                                     │
│                                                     │
│  glitool (CLI)                                      │
│  ├── ~/.glitool/auth.json   ← token + plan info     │
│  └── all LLM calls → Glitool Backend                │
└─────────────────────────────────────────────────────┘
                          │
                          │ HTTPS + Bearer glt_token
                          ▼
┌─────────────────────────────────────────────────────┐
│  Glitool Backend  (server/)                         │
│                                                     │
│  ├── Auth routes       /auth/*                      │
│  ├── LLM proxy         /v1/chat/completions         │
│  ├── Token middleware  validate + check plan        │
│  ├── Usage middleware  monthly counter              │
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

**New: `src/auth.ts`**
- On startup: read `~/.glitool/auth.json`
- If missing or expired → trigger device code flow
- Poll `/auth/device/poll` every 5s until complete
- Save `{ token, plan, email, requests_remaining, reset_date }` to disk
- Export `getAuthToken()` and `getAuthInfo()`

**New: `src/ui/AuthFlow.tsx`**
- Ink component shown during registration
- Displays URL, user code, animated waiting spinner
- On success: shows email + plan + requests remaining
- On limit hit: shows upgrade URL + reset date

**Modified: `src/agent.ts` + all agent files**
- Replace `apiKey: process.env.OPENAI_API_KEY` with `getAuthToken()`
- Set `configuration.baseURL` to Glitool backend

```ts
// Before
new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY })

// After
new ChatOpenAI({
    model,
    apiKey: getAuthToken(),
    configuration: { baseURL: 'https://api.glit.in/v1' }
})
```

Zero changes to any agent file — only the base URL + key source change.

**Modified: `src/ui/StatusBar.tsx`**
- Show `free · 42/50 req` or `pro · unlimited` next to model name

---

### 2. Backend (`server/`)

**Tech stack:** TypeScript + Node.js + Express + better-sqlite3

**Database schema:**

```sql
anon_usage
  uuid          TEXT PRIMARY KEY    -- from ~/.glitool/anon.json
  request_count INTEGER DEFAULT 0  -- max 5, then registration required
  created_at    TEXT
  last_seen     TEXT

users
  id                TEXT PRIMARY KEY    -- UUID
  email             TEXT UNIQUE
  github_id         TEXT UNIQUE
  github_username   TEXT
  name              TEXT
  plan              TEXT DEFAULT 'free' -- free | pro
  created_at        TEXT

access_tokens
  token             TEXT PRIMARY KEY    -- "glt_" + 32 random chars
  user_id           TEXT
  created_at        TEXT
  expires_at        TEXT                -- 90 days from creation

device_codes
  device_code       TEXT PRIMARY KEY    -- random, sent to CLI (never shown)
  user_code         TEXT                -- "ABC-123", shown to user
  user_id           TEXT                -- NULL until claimed
  access_token      TEXT                -- filled when claimed
  status            TEXT                -- pending | complete | expired
  created_at        TEXT
  expires_at        TEXT                -- 5 minutes

usage
  user_id           TEXT
  month             TEXT                -- "2026-05" (resets monthly)
  request_count     INTEGER DEFAULT 0
  PRIMARY KEY (user_id, month)

subscriptions
  user_id           TEXT PRIMARY KEY
  stripe_customer   TEXT
  stripe_sub_id     TEXT
  status            TEXT                -- active | cancelled | past_due
  current_period_end TEXT
```

**API routes:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/device` | None | Generate device code + user code |
| GET | `/auth/device/poll` | None | CLI polls — returns token when ready |
| GET | `/auth/github` | None | Redirect to GitHub OAuth |
| GET | `/auth/github/callback` | None | GitHub OAuth callback |
| POST | `/v1/chat/completions` | Bearer | OpenAI-compatible proxy |
| GET | `/account/me` | Bearer | Return plan + usage info |
| POST | `/webhooks/stripe` | Stripe sig | Handle subscription events |

**Middleware stack on `/v1/*`:**
1. `validateToken` — check token exists + not expired → attach user to request
2. `checkUsageLimit` — free tier: reject with 402 if `request_count >= 50`
3. `trackUsage` — increment `usage.request_count` after successful proxy
4. Rate limit on `/auth/device` — max 10 requests/IP/hour

---

### 3. Website (`client/`)

**Tech stack:** Next.js

**Pages:**

| Page | Purpose |
|------|---------|
| `/` | Landing page — what glitool is, pricing |
| `/activate` | Device code entry + GitHub login |
| `/dashboard` | Usage this month, plan info, upgrade button |
| `/upgrade` | Stripe checkout for Pro |
| `/pricing` | Free vs Pro comparison |

**`/activate` flow:**
1. User arrives with no session
2. Clicks "Continue with GitHub"
3. GitHub OAuth → redirected back
4. Page shows input: "Enter your terminal code"
5. User types ABC-123 → backend links device to account
6. Page shows: "You're connected. Go back to your terminal."

---

## File Structure After Build

```
Glitool/
├── CLI/
│   └── src/
│       ├── auth.ts              ← NEW
│       ├── ui/
│       │   └── AuthFlow.tsx     ← NEW
│       ├── ui/StatusBar.tsx     ← MODIFIED (show plan + usage)
│       └── agent.ts             ← MODIFIED (backend URL + auth token)
│
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── db.ts
│   │   ├── routes/
│   │   │   ├── auth.ts          ← device flow + GitHub OAuth
│   │   │   ├── proxy.ts         ← /v1/chat/completions
│   │   │   └── account.ts       ← /account/me
│   │   └── middleware/
│   │       ├── validateToken.ts
│   │       ├── checkUsageLimit.ts
│   │       └── trackUsage.ts
│   ├── package.json
│   └── tsconfig.json
│
└── client/
    ├── app/
    │   ├── page.tsx             ← landing
    │   ├── activate/page.tsx    ← device code entry
    │   ├── dashboard/page.tsx   ← usage + plan
    │   └── upgrade/page.tsx     ← Stripe checkout
    ├── package.json
    └── next.config.ts
```

---

## Open Decisions

| Question | Decision | Status |
|----------|----------|--------|
| OAuth providers | GitHub only first | ✅ decided |
| Anonymous trial | 5 requests via local UUID | ✅ decided |
| Free tier limit | 50 requests/month | ✅ decided |
| Limit reset | Monthly (1st of month) | ✅ decided |
| Token expiry | 90 days | ✅ decided |
| Pro tier price | $12/month | ✅ decided |
| Domain name | ❓ undecided | ❓ |
| Backend hosting | ❓ undecided | ❓ |
| Stripe integration | In schema, build later | ⏳ later |
| Google OAuth | Add after launch | ⏳ later |

---

## Build Order

1. **Backend** — SQLite setup, auth routes, device flow, GitHub OAuth, OpenAI proxy, usage middleware
2. **Website `/activate`** — GitHub login + device code claim page
3. **CLI `auth.ts`** — device flow, token storage, startup check
4. **CLI agent wiring** — swap base URL + key source, update StatusBar
5. **End-to-end test** — fresh install → register → use → hit limit → see upgrade message
6. **Deploy** — backend + website live
7. **Publish CLI v2.0.0** — breaking change: requires account

---

## Notes

- **Zero agent file changes** — OpenAI-compatible proxy means only `baseURL`
  and `apiKey` source change. All LangChain streaming, tool calls, and model
  selection work identically.
- **SQLite now, Postgres later** — SQLite handles thousands of users fine.
  Migrate when you need horizontal scaling.
- **Stripe deferred** — wire the schema now, build checkout after launch.
  Free + Pro is enough to validate before investing in billing infrastructure.
- **Local key override** — keep `OPENAI_API_KEY` as a fallback for power
  users who want BYOK. If env var exists, skip auth entirely.
