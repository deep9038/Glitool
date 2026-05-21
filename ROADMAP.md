# Glitool — Production Roadmap

## Context

Glitool is an AI-powered coding agent CLI. The vision is to build an **affordable, beginner-friendly, privacy-aware coding assistant** that not only writes code but also teaches, reviews, and helps ship projects safely.

**Target audience (in order):**
1. **Individual developers, students, freelancers** — MVP focus
2. **Corporate offices** — later expansion with on-premise deployment and role-based access

**LLM Strategy:**
- **Now:** `gpt-4o-mini` for the cheap path, `gpt-4o` for the strong path — via OpenAI
- **Production users:** Together AI — 10× cheaper open-source models (Llama 3, Qwen, Mixtral). OpenAI-compatible API so switching is just a `baseURL` change
- **Self-hosted (corporate):** Ollama on rented GPU (RunPod) for full privacy

**Business model:** Paid plans with India-friendly pricing tiers

Key principles:
- **CLI first** — stabilize developer experience before web UI
- **Privacy-aware** — support self-hosted LLMs so no data leaves the user's machine
- **Affordable** — open-source model routing to cut cost
- **Trust & safety** — user always sees what the agent will do before it acts
- **Teach while building** — explain changes in simple language

---

## Current State (as of v1.0.1)

### What works
- Published to npm as `glitool@1.0.1`
- New UI shell built on Ink: Welcome screen with workspace + runtime cards, slash command palette, tool log, pipeline cards (Planner/Coder/Reviewer), inline diff confirm card, explain mode side-rail, status bar with state/model/tokens
- First-run API key prompt → saves to `~/.glitool/.env`
- Path-sandboxed file tools: `readFile`, `writeFile`, `editFile`, `searchCode`, `listFiles`
- Risk scoring + confirm gate on every write/edit
- Session summary + project memory persisted between runs
- Regex-based router with domain (chat/coding/explanation/planning), complexity score, and tier (quick/standard/complex)
- Routing telemetry → `~/.glitool/routing.log.jsonl`
- Multi-line paste detection in input

### What is broken
| Issue | Where |
|---|---|
| Fake model IDs `gpt-5.4` / `gpt-5.4-mini` crash on any coding prompt | `agents/planner.ts`, `agents/coder.ts`, `agents/reviewer.ts`, `llm/router.ts` |
| Router picks a model by tier, but agents hardcode their own | router.ts vs agents/*.ts |
| No bash/shell tool — agent can't run `tsc`, `npm test`, `git`, dev servers | tools/ |
| Reviewer never sees compiler or lint output — no real quality gate | agents/reviewer.ts |
| `MAX_ITERATIONS = 1` disables the review/retry loop | agents/graph.ts |
| Regex router defaults `"build me a CLI"` to chat, miss-classifies anaphoric prompts | llm/router.ts |
| `@langchain/langgraph` installed but unused — graph.ts is a procedural loop | agents/graph.ts |
| `analyzeProject` tool overlaps with `readProject` | tools/analyzeProject.ts |
| `readProject` exposed to LLM but only used at startup | tools/index.ts |
| 0% test coverage | — |

---

## Phase 2 — Agent Architecture v2 (current focus)

**Goal:** Turn glitool from a UI shell into a real coding agent. Detail docs: [ROUTING.md](ROUTING.md), [TOOLS.md](TOOLS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DOMAINS.md](DOMAINS.md), [MEMORY.md](MEMORY.md).

The work is split into three layers, applied in this order to avoid blockers:

```
2A  Routing layer       — fix model IDs, unify model selection, slash routes
2B  Tools layer         — bash, background processes, glob, webFetch
2C  Architecture layer  — classifier, workflow, validator, judge, state graph
```

Each step is small enough to ship in one session. Verify before moving to the next.

---

### 2A — Routing layer (½ day total)

#### Step 2A.1 — Fix broken model IDs (15 min) — **blocker**

Without this every coding prompt crashes. Replace fake IDs with real ones.

**Files:**
- `CLI/src/llm/router.ts:27-28` — `gpt-5.4-mini` → `gpt-4o-mini`, `gpt-5.4` → `gpt-4o`
- `CLI/src/agents/planner.ts:7` — `gpt-5.4` → `gpt-4o`
- `CLI/src/agents/coder.ts:10` — `gpt-5.4-mini` → `gpt-4o-mini`
- `CLI/src/agents/reviewer.ts:6` — `gpt-5.4-mini` → `gpt-4o-mini`
- `CLI/src/llm/router.ts:19` — drop the `userPref !== 'gpt-4o-mini'` clause so `preferredModel` override actually works

**Verify:** send a coding prompt, no `model_not_found` error.

#### Step 2A.2 — Unify model selection (30 min)

The graph should use the tier-selected model, not hardcode its own.

**Files:**
- `CLI/src/agents/graph.ts` — accept `RouteDecision` as a parameter
- `CLI/src/agents/planner.ts`, `coder.ts`, `reviewer.ts` — accept model name from caller instead of constructing at module load
- `CLI/src/agent.ts:93` — pass `decision` into `runAgentGraph`

**Decision rule:** Planner uses `complex` tier, Coder uses `decision.recommendedModel`, Reviewer uses `standard` tier.

**Verify:** routing log shows the chosen model used in graph stages.

#### Step 2A.3 — Slash command routing (1 hr)

Free, instant user-controlled routing.

**Files:**
- `CLI/src/llm/router.ts` — add `parseExplicitRoute(prompt)`. Returns `null` if no slash command, else fully-formed `RouteDecision` with `source: 'explicit'`. Wire as first check in `route()`.

**Supported:**
- `/plan <prompt>` → planning/complex/graph
- `/quick <prompt>` → chat/quick/simple
- `/coder <prompt>` → coding/standard/graph
- `/explain <prompt>` → explanation/quick/simple

**Verify:** `/plan refactor auth` triggers graph path regardless of content.

#### Step 2A.5 — Extend router to detect all 8 domains (30 min)

Routing-only change — no new agents yet. Just teach the regex and LLM classifier to recognise all domains defined in [DOMAINS.md](DOMAINS.md).

**File:** `CLI/src/llm/router.ts` — extend `detectDomain()` with new patterns:

| Domain | Key regex signals |
|---|---|
| `debugging` | "error:", "crash", "failing", "broken", "fix this", "exception", "not working" |
| `refactoring` | "refactor", "clean up", "simplify", "restructure", "rename", "extract" |
| `review` | "review", "audit", "check for issues", "is this good", "security check" |
| `git` | "commit", "git", "what changed", "staged", "push", "branch" |
| `planning` | "plan", "design", "roadmap", "brainstorm", "architecture for" |

Also fix the execution fork in `CLI/src/agent.ts` — change:
```ts
if (decision.domain === 'coding' || decision.tier === 'complex')
```
to:
```ts
if (decision.domain === 'coding')
```
Complex non-coding tasks (debugging, review, etc.) should use the simple agent with `gpt-4o`, not the coding graph.

**Verify:** "why does this crash" logs `domain: debugging`. "review my router" logs `domain: review`. "refactor agent.ts" logs `domain: refactoring`.

---

#### Step 2A.4 — Confidence flag (30 min)

Refactor only — produces a `confidence: 'high' | 'low'` flag in the regex decision. Used by 2C.1 to decide when to escalate to the LLM classifier.

**File:** `CLI/src/llm/router.ts` — extend `RouteDecision` with `confidence` and `source`. Add the pronoun/anaphora detector (`this`, `that`, `it`, very short prompts, imperatives without objects → `confidence = 'low'`).

**Verify:** today's prompts log sensible confidence values; behavior unchanged.

---

### 2B — Tools layer (3 days total)

#### Step 2B.1 — `bashTool` (1 day) — **highest leverage**

Without this, the Validator agent and any agent that runs `git`/`npm`/`tsc` is impossible.

**Files:**
- `CLI/src/tools/bashTool.ts` (new)
- `CLI/src/trust/riskScorer.ts` — extend with shell patterns
- `CLI/src/tools/index.ts`, `CLI/src/agent.ts`, `CLI/src/agents/coder.ts` — register the tool

**Implementation:**
- Wrap `child_process.spawn`, foreground mode collects output
- 30s default timeout, 10KB output cap with `truncated` flag
- Risk-check **before** spawn — hard-block `rm -rf`, `sudo`, `curl ... | sh`. Confirm-required for `git push`, `npm install`, `npm publish`
- Stream stdout/stderr to UI tool log

**Verify:**
- `bash("ls")` works
- `bash("rm -rf /")` blocked
- `bash("git push")` triggers confirm
- `bash("npx tsc --noEmit")` returns real type errors

#### Step 2B.2 — Background processes (½ day)

For dev servers and long-running tests.

**Files:**
- Extend `CLI/src/tools/bashTool.ts` with `runInBackground: true`
- `CLI/src/tools/readBackgroundOutput.ts` (new)
- `CLI/src/tools/processRegistry.ts` (new) — `Map<handle, {proc, stdout, stderr, exitCode}>`
- Register cleanup on session exit

**Verify:** start `npm run dev` in background, read accumulating logs, all processes die on `/exit`.

#### Step 2B.3 — Drop `analyzeProject`, internalize `readProject` (15 min)

**Files:**
- Delete `CLI/src/tools/analyzeProject.ts`
- Remove `readProject` from `CLI/src/tools/index.ts` exports (keep the file; it's still used at startup)
- Update `CLI/src/agent.ts` tool array

**Verify:** tool count in banner drops, startup context still loaded.

#### Step 2B.4 — Glob in `listFiles` (½ day)

**Files:**
- `npm i fast-glob` in `CLI/`
- Rewrite `CLI/src/tools/listFilesTool.ts` to accept `pattern` and `ignore`
- Default ignores: `node_modules/**`, `dist/**`, `.git/**`

**Verify:** `listFiles({ pattern: "src/**/*.ts" })` returns only matching files.

#### Step 2B.5 — `webFetch` (½ day)

**Files:**
- `npm i turndown` in `CLI/`
- `CLI/src/tools/webFetchTool.ts` (new)
- Register in tools/index.ts and agent tool arrays

**Implementation:** `fetch()` + turndown HTML→markdown. Reject `file://` and non-http(s) schemes.

**Verify:** fetch nodejs.org docs → readable markdown. `file:///etc/passwd` rejected.

---

### 2C — Architecture layer (6 days total)

#### Step 2C.0 — Planning Agent (1.5 hr) — see [DOMAINS.md §2.4](DOMAINS.md)

Standalone agent, no dependencies on later 2C steps. First domain-specific agent we build.

**Files:**
- `CLI/src/agents/planner-agent.ts` (new) — distinct from `planner.ts` which generates coding plans
- `CLI/src/agent.ts` — wire `domain === 'planning'` to the new agent

**Behavior:**
- Turn 1: check if `plan.md` exists (`readFileTool`) → generate plan from user message → write to `plan.md` → summarize what's in it
- Turn 2+: read current `plan.md` → apply user's change → save → show what changed
- Only writes `.md` files. Hard-blocked from writing `.ts`, `.js`, or any source files.

**Verify:** "plan a payment system" → `plan.md` created. "add refund support" → `plan.md` updated with new section.

---

#### Step 2C.1 — LLM classifier (2 hr)

Hybrid router: regex for clear cases, LLM call for ambiguous ones. Behind a config flag for A/B comparison.

**Files:**
- `CLI/src/llm/classifier.ts` (new) — exports `classifyWithLlm(prompt, recentMessages)`
- `CLI/src/llm/router.ts` — make `route()` async. When `confidence === 'low'`, call classifier. Validate output against enum; fall back to regex on parse failure.
- `CLI/src/agent.ts:89` — `const decision = await route(userInput, sessionMessages.slice(-6))`
- `CLI/src/config.ts` — `routing.useLlmClassifier: boolean` (default true)
- `CLI/src/llm/telemetry.ts` — add `source`, `confidence`, `regex_said`, `llm_said`, `classifier_tokens`, `latency_ms`, `escalation_reason` fields

**Classifier:** `gpt-4o-mini` with `response_format: { type: 'json_object' }`. Cap input at ~1000 tokens of history. 3s timeout.

**Verify:** ambiguous prompts (`"make this faster"`, `"keep going"`) now route correctly given prior context.

#### Step 2C.2 — Validator agent (1 day) — depends on 2B.1 (bash)

Single highest-leverage stage. No LLM. Catches ~60% of bugs.

**Files:**
- `CLI/src/agents/validator.ts` (new)
- `CLI/src/agents/graph.ts` — call Validator after Coder
- `CLI/src/ui/Pipeline.tsx` — add a Validator card

**Behavior:**
1. After Coder finishes, identify changed files
2. Run `bash("npx tsc --noEmit")`, collect errors attributable to changed files
3. Run `bash("npx eslint <changed-files>")`, collect errors
4. If both pass → proceed to Judge
5. If either fails → append errors as `HumanMessage` to Coder, rerun once. Max 2 retries.

**Verify:** induce a deliberate TS error in a generated edit → Coder reruns with compiler output.

#### Step 2C.3 — Structured plan format (½ day)

The Planner currently emits free-form text. Workflow and Judge both need structured input.

**File:** `CLI/src/agents/planner.ts`

**Behavior:** Planner returns JSON array of steps: `[{ id, action, target, depends_on, why }]`. Fallback: if parse fails, treat full response as one step. Coder's system prompt reads structured input.

**Verify:** print parsed plan on a coding prompt; shape is `Step[]`.

#### Step 2C.4 — Workflow agent (1 day)

LLM call that takes the structured plan and emits a DAG topology.

**Files:**
- `CLI/src/agents/workflow.ts` (new)
- `CLI/src/agents/graph.ts` — insert Workflow between Planner and Coder
- `CLI/src/ui/Pipeline.tsx` — add Workflow card

**Behavior:** Input is `Step[]`. Output is `Topology` JSON. v1 supports `seq` and `parallel` only. Read-only steps with no shared deps go into the same parallel group. Executor can still run sequentially in v1 — topology is recorded for the Judge.

**Verify:** prompt that reads three files and edits one → topology puts the three reads in one parallel group.

#### Step 2C.5 — Reviewer → Judge (2 days)

The biggest change. Reviewer becomes Judge with localized failure detection.

**Files:**
- Rename `CLI/src/agents/reviewer.ts` → `CLI/src/agents/judge.ts`
- `CLI/src/agents/graph.ts` — pass full `AgentState` to Judge
- `CLI/src/ui/Pipeline.tsx` — Judge card

**Behavior:** Input is the full state. Executions stored as summaries (500 chars + diff) to keep token count bounded. Output:
```ts
{ verdict: 'ok' | 'fail',
  failure_point: 'plan' | 'workflow' | 'executor' | 'final_output' | null,
  failure_step_id: number | null,
  reason: string,
  fix_hint: string,
  confidence: number }
```
Route by failure_point: `plan` → Planner, `workflow` → Workflow, `executor` → Executor at `failure_step_id`, `final_output` → Executor with hint. Track `loop_count`, escalate at 3. If the same failure_point twice in a row, escalate immediately.

**Verify:** induce a wrong import → Judge flags `final_output`, agent retries.

#### Step 2C.6 — Real StateGraph (2 days)

Replace the procedural `while` loop with `@langchain/langgraph`'s `StateGraph`. Unlocks parallel execution and true `Command(goto=...)` resumption.

**Files:**
- Rewrite `CLI/src/agents/graph.ts` as `StateGraph<AgentState>`
- Add `MemorySaver` checkpointer

**Behavior:** Each agent is a node. Judge returns `Command(goto=...)` to resume at a specific node. Parallel groups fan out as parallel branches. Checkpointer means partial runs can be resumed.

**Verify:** LangGraph trace shows `goto` skips Planner when failure is in executor.

#### Step 2C.8 — Review Agent (1 hr) — see [DOMAINS.md §2.7](DOMAINS.md)

Read-only analysis agent. Depends on 2B.1 (bash for tsc/eslint output).

**Files:**
- `CLI/src/agents/reviewer-agent.ts` (new) — distinct from the Judge
- `CLI/src/agent.ts` — wire `domain === 'review'` to this agent

**Behavior:** Read target files → run `npx tsc --noEmit` + `npx eslint` → return structured report (CRITICAL / WARNING / SUGGESTION). Hard-blocked from calling `writeFileTool` or `editFileTool` — enforced at the agent tool list level, not just in the prompt.

**Output format:**
```
## Summary
## Issues (CRITICAL / WARNING / SUGGESTION)
## What's good
```

**Verify:** "review router.ts" → returns analysis, no file is changed. Attempt to write a file → blocked.

---

#### Step 2C.9 — Debugging Agent (1.5 hr) — see [DOMAINS.md §2.5](DOMAINS.md)

Investigate-first agent. Depends on 2C.2 (Validator) to verify the fix works.

**Files:**
- `CLI/src/agents/debugger.ts` (new)
- `CLI/src/agent.ts` — wire `domain === 'debugging'` to this agent

**Behavior (strict order):**
1. Read the error / reproduce it via bash
2. Search the codebase for root cause
3. Explain diagnosis to user
4. Apply minimal patch (no new features)
5. Re-run the failing command to verify fix passes

**Verify:** "why does X crash" → agent traces the error, explains root cause before editing anything.

---

#### Step 2C.10 — Refactoring Agent (1.5 hr) — see [DOMAINS.md §2.6](DOMAINS.md)

Behavior-safe edit agent. Depends on 2C.5 (Judge) and 2B.1 (bash for tests).

**Files:**
- `CLI/src/agents/refactorer.ts` (new)
- `CLI/src/agent.ts` — wire `domain === 'refactoring'` to this agent

**Behavior (strict order):**
1. Read target files
2. Run existing tests (baseline) — if no tests, warn user
3. Apply structural changes only — no new features, no behavior changes
4. Run tests again
5. If tests pass → done. If fail → revert all edits and explain what went wrong.

**Verify:** "clean up router.ts" → tests run before and after. Deliberate behavior change → rejected.

---

#### Step 2C.11 — Git Agent (1 hr) — see [DOMAINS.md §2.8](DOMAINS.md)

Bash-only agent. Can be built any time after 2B.1 (bash exists).

**Files:**
- `CLI/src/agents/git-agent.ts` (new)
- `CLI/src/agent.ts` — wire `domain === 'git'` to this agent

**Behavior:** bash-only — runs `git` commands, reads their output, responds. Hard-blocked from `readFileTool`, `writeFileTool`, `editFileTool`. Confirm-required for `git push`, `git reset --hard`, `git rebase` (handled by existing riskScorer).

**Verify:** "write a commit message" → runs `git diff`, composes message, does NOT edit source files. "git push" → confirm prompt appears.

---

#### Step 2C.7 — Escalation UI (1 day)

When loop count hits the cap, surface the trajectory.

**Files:**
- `CLI/src/ui/EscalationCard.tsx` (new)
- `CLI/src/ui/App.tsx` — render the card when escalation happens

**Behavior:** Show original request, plan, what Judge said each iteration, current state. Three actions: Approve as-is / Give correction (sends hint back to Planner) / Abort.

**Verify:** force three Judge failures → EscalationCard appears with trajectory.

---

### 2D — Observe and iterate (1 week)

Run glitool for a week. Read `~/.glitool/routing.log.jsonl`. Answer:
- What % of turns hit the LLM classifier? (cost / latency)
- What % of classifier disagrees with regex? (was escalation valuable?)
- Which prompts silently default to chat most often? (add regex patterns)
- Are there new domains the classifier picks that you don't model? (extend taxonomy)
- How often does the Judge escalate? (failure cap calibrated correctly?)

This data drives the next iteration. Don't skip it — without telemetry you're tuning by intuition.

---

## Phase 3 — Platform Auth & Managed Backend (v2.0.0) ← NEXT

**Goal:** Move from "bring your own API key" to a managed platform.
Users sign in with GitHub, all LLM calls route through Glitool's backend.
Glitool owns the OpenAI key. Three-tier model:

```
Anonymous  →  5 lifetime requests, no sign-in, local UUID tracking
Free       →  50 requests/month, one GitHub click
Pro        →  $12/month, unlimited
```

Full design spec: [AUTH_PLAN.md](AUTH_PLAN.md)

---

### PA.1 — Backend scaffolding (1 day)

Set up the bare minimum Express server with SQLite.

**Create `server/` structure:**
```
server/
├── src/
│   ├── index.ts        ← Express app + routes mount
│   ├── db.ts           ← better-sqlite3 setup + all table migrations
│   └── routes/         ← empty for now, filled in PA.2 and PA.3
├── package.json
└── tsconfig.json
```

**`server/package.json` dependencies:**
```json
"express", "better-sqlite3", "dotenv", "cors",
"@types/express", "@types/better-sqlite3", "tsx", "typescript"
```

**`db.ts` creates all tables on startup:**
- `anon_usage` — UUID + request_count (max 5)
- `users` — id, email, github_id, github_username, name, plan, created_at
- `access_tokens` — token, user_id, expires_at (90 days)
- `device_codes` — device_code, user_code, user_id, access_token, status, expires_at
- `usage` — user_id + month (PRIMARY KEY) + request_count
- `subscriptions` — user_id, stripe fields (wired now, built later)

**Verify:** `npm run dev` starts, `GET /health` returns `{ ok: true }`.

---

### PA.2 — GitHub OAuth + Device Code flow (1 day)

The core auth routes. This is the whole sign-in experience.

**File: `server/src/routes/auth.ts`**

| Route | What it does |
|-------|-------------|
| `POST /auth/device` | Generate `device_code` (random, for CLI) + `user_code` ("ABC-123", for user). Insert into `device_codes` with status `pending`, expires in 5 min. Return both to CLI. |
| `GET /auth/device/poll?device_code=xxx` | Check `device_codes` table. If `pending` → `{ status: 'pending' }`. If `complete` → `{ status: 'complete', access_token, plan, email, requests_remaining }`. If `expired` → `{ status: 'expired' }`. |
| `GET /auth/github` | Redirect to GitHub OAuth URL with `client_id` + `scope=user:email` + `state`. |
| `GET /auth/github/callback` | Exchange code for GitHub token → fetch user profile + email → upsert `users` table → generate `access_token` (glt_ + 32 random chars, 90 day expiry) → if device_code in session, mark it complete and attach token → redirect to `/activate?success=true`. |

**GitHub OAuth app:** Register at github.com/settings/applications/new.
Callback URL: `https://api.glitool.dev/auth/github/callback`

**Verify:**
- `POST /auth/device` → returns `{ device_code, user_code, expires_in: 300 }`
- `GET /auth/device/poll?device_code=xxx` → returns `{ status: 'pending' }`
- Full OAuth flow in browser → user row in DB, device_code marked complete
- Poll after OAuth → returns `{ status: 'complete', access_token: 'glt_...' }`

---

### PA.3 — OpenAI-compatible proxy (1 day)

The revenue-critical route. Every CLI request hits this.

**File: `server/src/routes/proxy.ts`**

Route: `POST /v1/chat/completions`

**Middleware chain (runs in order):**

1. **`validateToken`** — check `Authorization: Bearer glt_xxx` header. Look up `access_tokens` table. If missing/expired → 401. Attach `user` to `req`.

2. **`checkAnon`** — if request has `X-Anon-ID` header instead of Bearer token: look up `anon_usage`. If count >= 5 → 402 with `{ error: 'anon_limit', message: 'Sign in for more requests' }`. Else increment count and continue.

3. **`checkUsageLimit`** — for authenticated users: if `plan === 'free'` and this month's `request_count >= 50` → 402 with `{ error: 'monthly_limit', upgrade_url: 'https://glitool.dev/upgrade' }`.

4. **Proxy** — strip Glitool token, attach real OpenAI API key, forward request body as-is to `https://api.openai.com/v1/chat/completions`. Stream the response back directly (pipe, don't buffer). This preserves LangChain streaming with zero changes.

5. **`trackUsage`** — after successful proxy: upsert `usage` row for `(user_id, YYYY-MM)`, increment `request_count`.

**Important:** The proxy must support streaming (`Transfer-Encoding: chunked`).
LangChain's ChatOpenAI uses streaming by default — if the proxy buffers, it breaks.

**Verify:**
- Valid token + valid OpenAI request → response streams through
- Expired token → 401
- Free user at 50 requests → 402 with upgrade URL
- Anonymous user at 5 requests → 402 with sign-in message

---

### PA.4 — Website `/activate` page (1 day)

**Create `client/` as a Next.js app.**

**`/activate` page flow:**
1. User arrives (no session yet)
2. Page shows "Continue with GitHub" button → redirects to `GET /auth/github`
3. After OAuth, GitHub redirects back to the page with `?success=true`
4. Page now shows: "Enter the code from your terminal"
5. User types ABC-123 → page calls `POST /auth/device/claim { user_code }` → backend links device_code to user
6. Page shows: "✓ You're connected. Go back to your terminal."

**`/dashboard` page (basic):**
- Fetch `GET /account/me` → show plan + requests used this month + reset date
- "Upgrade to Pro" button (links to Stripe checkout — wired later)

**Verify:** Full flow — terminal shows code → user opens URL → GitHub login → enters code → terminal detects completion.

---

### PA.5 — CLI anonymous trial (½ day)

Zero-friction first run. No sign-in required for 5 requests.

**File: `CLI/src/auth.ts` (partial — anon section)**

On startup, before any auth check:
1. Read `~/.glitool/anon.json` → `{ uuid, used }`. If missing, generate UUID and write file with `used: 0`.
2. If `used < 5` → allow request, send `X-Anon-ID: <uuid>` header instead of Bearer token.
3. Backend increments anon count. If response is 402 with `anon_limit` → trigger registration flow (PA.6).
4. After each anonymous request, update `anon.json` with `used++`.

**Status bar** shows remaining count:
```
■idle    gpt-4o-mini · 1.2k tokens    4 free requests left · /signup to unlock more
```

**Verify:** Fresh install → 5 requests work with no sign-in → 6th request triggers registration prompt.

---

### PA.6 — CLI auth module + AuthFlow UI (1 day)

Full registration experience in the terminal.

**File: `CLI/src/auth.ts`**

```ts
export async function ensureAuth(): Promise<AuthInfo>
// Called at startup after anonymous check.
// Returns { token, plan, email, requests_remaining, reset_date }
// Reads from ~/.glitool/auth.json first.
// If missing/expired → runDeviceFlow()

async function runDeviceFlow(): Promise<AuthInfo>
// POST /auth/device → get { device_code, user_code }
// Show AuthFlow UI with URL + code
// Poll GET /auth/device/poll every 5s
// On complete → save to ~/.glitool/auth.json → return AuthInfo

export function getAuthToken(): string
// Read token from ~/.glitool/auth.json
// Used by all ChatOpenAI instances

export function getAuthInfo(): AuthInfo | null
// Read full auth info (plan, usage, etc.)
```

**File: `CLI/src/ui/AuthFlow.tsx`**

Ink component displayed during registration:
```
  Sign in to continue — free, 50 requests/month.

  Open this URL in your browser:
  → https://glitool.dev/activate

  Your code:  ABC-123   (expires in 5 min)

  Waiting...  ◑

  ─────────────────────────────────────
  ✓ Signed in as deep22sarkar@gmail.com
    free tier · 50 requests/month
    47 remaining · resets June 1
```

**Verify:** `~/.glitool/auth.json` missing → AuthFlow shows → GitHub login → file written → glitool starts.

---

### PA.7 — CLI agent wiring (½ day)

Swap the API key source and base URL. **Zero changes to any agent file.**

**File: `CLI/src/agent.ts`** — change every `new ChatOpenAI(...)`:

```ts
// Before
new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY })

// After
new ChatOpenAI({
    model,
    apiKey: getAuthToken(),
    configuration: { baseURL: 'https://api.glitool.dev/v1' }
})
```

**Local key override** — if `OPENAI_API_KEY` env var exists, skip auth entirely
and use OpenAI directly. Power users and dev work.

```ts
const usingLocalKey = !!process.env.OPENAI_API_KEY;
```

**File: `CLI/src/ui/StatusBar.tsx`** — add plan + usage:
```
■idle    gpt-4o-mini · 1.2k tokens · $0.001    free · 47/50 req
```

**Verify:** Remove `.env` → requests route through backend. Add `OPENAI_API_KEY` → bypass auth, hit OpenAI directly.

---

### PA.8 — Deploy (1 day)

**Backend (Railway or Render):**
- Connect GitHub repo → auto-deploy `server/`
- Set env vars: `OPENAI_API_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_SECRET`
- Custom domain: `api.glitool.dev`

**Website (Vercel):**
- Connect GitHub repo → auto-deploy `client/`
- Set env vars: `NEXT_PUBLIC_API_URL=https://api.glitool.dev`
- Custom domain: `glitool.dev`

**GitHub OAuth app:**
- Update callback URL to production: `https://api.glitool.dev/auth/github/callback`
- Update homepage URL: `https://glitool.dev`

**Verify:** Full flow on production URLs. CLI on a clean machine → register → 50 requests/month.

---

### PA.9 — End-to-end test (½ day)

Test every path on a clean machine:

| Scenario | Expected |
|----------|---------|
| Fresh install, first prompt | Works anonymously, shows "4 free requests left" |
| 5th anonymous request | Works, shows "0 free requests left" |
| 6th anonymous request | Registration prompt appears |
| GitHub sign-in | AuthFlow completes, auth.json written |
| 50th free request | Works |
| 51st free request | 402 with upgrade URL shown in terminal |
| `OPENAI_API_KEY` in env | Bypasses auth, hits OpenAI directly |
| Token expired | Re-auth prompt, single GitHub click |

---

### PA.10 — Publish CLI v2.0.0 (½ hour)

- Bump `CLI/package.json` version to `2.0.0`
- Update `CLI/README.md` — remove API key setup section, replace with sign-in instructions
- `npm run build && npm publish`

**Breaking change notice in README:**
```
v2.0.0 requires a free Glitool account.
Run glitool — it will guide you through sign-in (one GitHub click).
Power users: set OPENAI_API_KEY in your environment to bypass auth.
```

**Total estimated time: 7–8 days**

---

## Phase 4 — Smart Memory & Beginner Mode (Weeks 5–7)

After Phase 2 ships, the agent is reliable. Now make it feel personal.

### 3.1 Session summaries (already partial)
- Already saving session summaries — extend to also extract observable preferences (languages used, frameworks, coding style)
- File: `CLI/src/preferences.ts` — `~/.glitool/preferences.json`, merged after each session
- Inject into system prompt at next session start

### 3.2 Beginner-friendly mode (`--explain`)
Already wired in UI as ExplainCard. Tune the prompts:
- After every code change, narrate what changed and why
- Suggest concepts to learn next
- Make tone friendly, no jargon dumps

### 3.3 Provider switch — Together AI
Mostly a config change once Phase 2 is stable:
- `CLI/src/llm/factory.ts` — read `LLM_PROVIDER=openai|together|ollama` from env
- Together AI is OpenAI-compatible — just baseURL + apiKey
- Document the toggle in README

---

## Phase 5 — Multi-Role + RAG (Weeks 8–12)

For corporate users and beginners who need extra hand-holding.

### 4.1 Specialized sub-agents
The Judge architecture from 2C.5 already supports routing to specialists. Add:
- **Tester agent** — writes and runs tests for new code (uses bashTool)
- **Security agent** — flags risky patterns before write
- **Doc agent** — generates README, comments, changelogs on demand

### 4.2 RAG over office data
- `CLI/src/rag/documentLoader.ts` — PDF/Word ingestion via langchain loaders
- `CLI/src/tools/searchDocsTool.ts` — Chroma vector search
- `CLI/src/tools/queryDatabaseTool.ts` — read-only SQL (SELECT only, no INSERT/UPDATE/DELETE)
- `CLI/src/tools/queryMongoTool.ts` — read-only Mongo
- `glitool rag index <path>`, `glitool rag add-db <conn>`, `glitool rag list`

### 4.3 Self-hosted Ollama path
- Docker Compose with Ollama + Chroma
- Document the corporate deployment path

---

## Phase 6 — Rescue + Freelance Modes (Weeks 13–16)

### 5.1 `glitool rescue`
- Scan inherited codebases for architectural issues, dead code, circular deps, security holes
- Generate prioritized repair roadmap
- Fix issues one by one with approval

### 5.2 `glitool deliver`
- Estimate effort for a task before starting
- Generate client-ready summaries from git history
- Produce deployment notes and handoff docs

Both modes piggyback on Phase 2 architecture — they're orchestration prompts, not new infrastructure.

---

## Phase 7 — Production Hardening (Weeks 17–20)

### 6.1 Test suite
- Jest + tsx in `CLI/src/tests/`
- Coverage for: router decisions, risk scorer, validator, judge routing, tool sandboxes

### 6.2 Logging
- `CLI/src/logger.ts` with winston
- Log to `~/.glitool/logs/` (never stdout — would break CLI UX)

### 6.3 Pricing tiers
| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Basic agent, limited requests/day, gpt-4o-mini only |
| **Solo** | ~₹499/mo | Unlimited requests, smart memory, model routing |
| **Pro** | ~₹999/mo | Multi-role agents, rescue, deliver modes |
| **Team/Corporate** | Custom | On-premise Ollama, RAG, role-based access, audit logs |

---

## Phase 8 — Web App (Weeks 21+)

- Activate `server/` — Express or Fastify wrapping the agent
- Activate `client/` — Next.js with role-based dashboards
- JWT auth + local user store
- Visual diff preview and file browser
- Same routing/architecture as CLI — server just hosts it

---

## Dependency Map

```
2A  Routing fixes      ←  blocker for everything else
2B  Tools layer        ←  bash unblocks Validator
2C  Architecture       ←  needs 2A + 2B
2D  Observe a week     ←  calibration before Phase 3

Phase 3  Memory + provider switch
Phase 4  RAG + multi-role
Phase 5  Rescue + Freelance
Phase 6  Hardening + pricing
Phase 7  Web app
```

---

## Verification Per Phase

- **2A:** model IDs fixed, no `model_not_found` errors, slash routes work
- **2B:** `bash("npx tsc --noEmit")` returns errors, `webFetch` works, `listFiles` accepts globs
- **2C:** induced TS error → validator rerun, induced semantic bug → judge routes to right node, three failures → escalation card
- **3:** session 2 of `glitool` shows it knows your stack without you telling it
- **4:** `glitool rag index ./docs` → ask question → correct answer
- **5:** `glitool rescue` produces a real repair roadmap
- **6:** `npm test` passes, `docker compose up` starts the full stack
- **7:** web UI hits the same router and produces matching results

---

## Quick reference

```
Build order:  2A.1 → 2A.2 → 2A.3 → 2A.4 → 2A.5       ✅ DONE
              → 2B.1 → 2B.2 → 2B.3 → 2B.4 → 2B.5       ✅ DONE
              → 2C.0 → 2C.1 → 2C.2 → 2C.3 → 2C.4        ✅ DONE
              → 2C.5 → 2C.6 → 2C.7 → 2C.8 → 2C.9        ✅ DONE
              → 2C.10 → 2C.11                             ✅ DONE (v1.1.0 published)

              → PA.1 → PA.2 → PA.3 → PA.4 → PA.5         ← NEXT
              → PA.6 → PA.7 → PA.8 → PA.9 → PA.10        (v2.0.0)

              → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Cross-refs:   ROUTING.md      → details for 2A
              TOOLS.md        → details for 2B
              ARCHITECTURE.md → details for 2C
              DOMAINS.md      → details for all 8 domains + agent constraints
              MEMORY.md       → details for Phase 3 memory system

Today's blocker:  2A.1 (15 minutes, unblocks the whole codebase)
```
