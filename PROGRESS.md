# PROGRESS.md — What's been built

This file tracks only completed work — verified by reading the actual source files. Updated: 2026-05-25. Current shipped version: **v2.0.3** on npm. Local dev branch: **v2.0.4-dev**.

---

## Summary

| Step | Name | Status |
|---|---|---|
| 2A.1 | Fix broken model IDs | ✅ Done |
| 2A.2 | Unify model selection | ✅ Done |
| 2A.3 | Slash command routing | ✅ Done |
| 2A.4 | Confidence flag + anaphora detector | ✅ Done |
| 2A.5 | Extend router — all 8 domains | ✅ Done |
| 2B.1 | `bashTool` | ✅ Done |
| 2B.2 | Background processes | ✅ Done |
| 2B.3 | Drop `analyzeProject`, internalize `readProject` | ✅ Done |
| 2B.4 | Glob in `listFiles` | ✅ Done |
| 2B.5 | `webFetch` tool | ✅ Done |
| 2C.0 | Planning Agent | ✅ Done |
| 2C.1 | LLM Classifier | ✅ Done |
| 2C.2 | Validator Agent | ✅ Done |
| 2C.3 | Structured plan format | ✅ Done |
| 2C.4 | Workflow Agent | ✅ Done |
| 2C.5 | Reviewer → Judge | ✅ Done |
| 2C.6 | Real StateGraph | ✅ Done |
| 2C.7 | Escalation UI | ✅ Done |
| 2C.8 | Review Agent | ✅ Done |
| 2C.9 | Debugging Agent | ✅ Done |
| 2C.10 | Refactoring Agent | ✅ Done |
| 2C.11 | Git Agent | ✅ Done |
| 3A.1 | ProcessEvent type system | ✅ Done |
| 3A.2 | ProcessTrace live UI component | ✅ Done |
| 3A.3 | Stage events wired through all agents | ✅ Done |
| 3A.4 | Trace frozen as message before reply | ✅ Done |
| 3B.1 | Block 5 — all domain agents tested | ✅ Done |
| 3B.2 | Block 6 — auto-routing verified | ✅ Done |
| 3C.1 | CODER trace fix (streamMode: updates) | ✅ Done |
| 3C.2 | Paste cursor fix (inputKey remount) | ✅ Done |
| 3C.3 | Git agent full add→commit→push flow | ✅ Done |
| 3C.4 | Tokens/cost for /plan | ✅ Done |
| 3C.5 | Real welcome workspace stats | ✅ Done |
| 3D.1 | glitool.md — full user documentation | ✅ Done |
| 3D.2 | AUTH_PLAN.md — auth & backend plan | ✅ Done |
| 3D.3 | README.md updated for v1.1.0 | ✅ Done |
| PA.1 | Server — Express + MongoDB + middleware stack | ✅ Done |
| PA.2 | GitHub OAuth (device code backend) | ✅ Done |
| PA.3 | Device code flow (CLI polls backend) | ✅ Done |
| PA.4 | Website /activate page (Next.js) | ✅ Done |
| PA.5 | Anonymous trial — UUID tracking, 5-req limit, status bar counter | ✅ Done |
| PA.6 | AuthFlow.tsx Ink component + /signup command | ✅ Done |
| PA.7 | Central LLM factory — all agents wired to Glitool backend | ✅ Done |
| PA.LLM | Together.ai migration — proxy, model routing, server logging | ✅ Done |
| PA.FIX | Together.ai compatibility fixes — all agents use makeLlm() | ✅ Done |
| PA.SEC | Rotated leaked secrets (GitHub OAuth, Together.ai key, Mongo password) + sanitized DEPLOYMENT.md | ✅ Done |
| PA.8 | Deploy backend to DigitalOcean droplet + Nginx + PM2 + Certbot SSL | ✅ Done |
| PA.9 | E2E test on production (anon → signup → free tier) | ✅ Done |
| PA.10 | Publish CLI v2.0.0 to npm | ✅ Done |
| PA.WEB | Vercel deploy + custom domain glit.in + /activate page (new) | ✅ Done |
| PA.MODELS | Together.ai serverless catalog fix — replaced 3 deprecated model IDs | ✅ Done |
| 201.1 | Request-id dedup so 1 user prompt = 1 server count (despite ReAct iterations) | ✅ Done |
| 201.2 | Lazy LLM creation in agent.ts + agents/explainer.ts | ✅ Done |
| 202.1 | Friendly anon_limit message + correct glit.in URL in CLI | ✅ Done |
| 202.2 | ANON_LIMIT 5→8 to absorb residual dedup leaks | ✅ Done |
| PE.0 | Doc audit + sync — 11 MD files reconciled with shipped state | ✅ Done |
| PE.1 | Fix CRITICAL bug: planningAgent.ts shipped literal `...existing logic...` placeholder | ✅ Done |
| PE.2 | planner.ts — add concrete examples + clarified action values | ✅ Done |
| PE.3 | reviewer-agent.ts — resolve dual-format conflict (single plain-text spec) | ✅ Done |
| PE.4 | classifier.ts — add high/low confidence calibration | ✅ Done |
| PE.5 | judge.ts — fix `executor`/`execution` type mismatch | ✅ Done |
| PE.6 | agent.ts — add style guardrails (no preamble, code-block tags, backticks) | ✅ Done |
| PE.7 | memory.ts — sharper session summary prompt | ✅ Done |
| PE.8 | projectMemory.ts — clarified merge behavior with concrete example | ✅ Done |
| PE.9 | explainer.ts — fix typos (biginner/underStand/Give what) + cleaner structure | ✅ Done |
| PE.10 | coder.ts — add response style guidance | ✅ Done |
| PE.11 | Delete dead `agents/reviewer.ts` (replaced by judge.ts + reviewer-agent.ts) | ✅ Done |
| DEV.1 | `start:dev` scripts — server, client, root with concurrently | ✅ Done |
| DEV.2 | Lazy `backendUrl()` in factory.ts — `~/.glitool/.env` now works | ✅ Done |
| DEV.3 | `server/.env.local` + `start:local` script via dotenv-cli | ✅ Done |
| DEV.4 | CORS reads `CLIENT_URL` from env — allows localhost in dev | ✅ Done |
| DEV.5 | Dev Monitor dashboard — real-time events, loop detection, copy session | ✅ Done |
| DEV.6 | Bug fixes: config.json cache, stream_options token tracking | ✅ Done |

---

## Phase 2A — Routing layer

### ✅ 2A.1 — Fix broken model IDs

**File:** `CLI/src/llm/router.ts`

Replaced fake model IDs with real OpenAI models:

```ts
const MODEL_BY_TIER: Record<TaskTier, string> = {
    quick:    'gpt-4o-mini',
    standard: 'gpt-4o-mini',
    complex:  'gpt-4o',
};
```

Coding prompts no longer crash with `model_not_found`.

---

### ✅ 2A.2 — Unify model selection

**Files:** `CLI/src/agents/graph.ts`, `CLI/src/agent.ts`, `CLI/src/agents/planner.ts`, `CLI/src/agents/coder.ts`, `CLI/src/agents/reviewer.ts`

The graph now accepts a `RouteDecision` and derives models from it:

```ts
const plannerModel  = getModelForTier('complex');   // always gpt-4o
const coderModel    = decision.recommendedModel;    // from router
const reviewerModel = getModelForTier('standard');  // gpt-4o-mini
```

`agent.ts` passes the decision into the graph:
```ts
await runAgentGraph(cleanedInput, buildSystemPrompt(), onToolCall, onStatus, decision);
```

Each agent (planner, coder, reviewer) now accepts the model name from the caller instead of hardcoding it.

---

### ✅ 2A.3 — Slash command routing

**File:** `CLI/src/llm/router.ts`

Four explicit routes wired:

```ts
const EXPLICIT_ROUTES = {
    '/plan':    { domain: 'planning',    tier: 'complex' },
    '/coder':   { domain: 'coding',      tier: 'standard' },
    '/quick':   { domain: 'chat',        tier: 'quick' },
    '/explain': { domain: 'explanation', tier: 'quick' },
};
```

`parseExplicitRoute()` checks for slash commands first — if matched, returns immediately with `source: 'explicit'` and `confidence: 'high'`. `stripExplicitPrefix()` removes the slash command before the message is sent to the agent.

---

### ✅ 2A.4 — Confidence flag + anaphora detector

**File:** `CLI/src/llm/router.ts`

`RouteDecision` now carries `confidence: 'high' | 'low'` and `source: 'regex' | 'explicit'`.

Anaphora patterns detect pronouns and vague imperatives:
```ts
const ANAPHORA_PATTERNS = [
    /\b(this|that|it|those|these)\b/i,
    /\b(again|instead|previous|prior)\b/i,
];
const VAGUE_IMPERATIVES = [
    /^(do it|fix it|redo|undo|keep going|continue|proceed|go ahead)\b/i,
];
```

`computeConfidence()` returns `'low'` when anaphora is detected, pattern didn't match, or prompt is long and ambiguous. This flag will be used by the LLM classifier (2C.1) to decide when to escalate.

---

## Phase 2B — Tools layer

### ✅ 2B.1 — `bashTool`

**File:** `CLI/src/tools/bashTool.ts`

Wraps `child_process.spawn` with:
- Risk check **before** spawn via `scoreShellRisk()` — dangerous commands blocked, sensitive commands require user confirmation
- 30s default timeout
- 10KB output cap per stream with `truncated` flag
- Streams stdout + stderr separately

```ts
schema: z.object({
    command: z.string(),
    timeout: z.number().optional(),
    runInBackground: z.boolean().optional(),
})
```

---

### ✅ 2B.2 — Background processes

**Files:** `CLI/src/tools/processRegistry.ts`, `CLI/src/tools/readBackgroundOutput.ts`, `CLI/src/tools/bashTool.ts` (extended), `CLI/src/agent.ts`

**processRegistry.ts** — in-memory store for running processes:
- `registerProcess(proc, command)` → returns handle (`bg_1`, `bg_2`, ...)
- `getProcess(handle)` → returns accumulated stdout/stderr + exit code
- `killProcess(handle)` → kills and removes from registry
- `cleanupAll()` → kills everything (called on session exit)

**readBackgroundOutput tool** — agent calls this with a handle to read accumulated logs, optionally kill the process.

**bashTool** extended — `runInBackground: true` spawns without waiting, registers in processRegistry, returns handle string immediately.

**agent.ts** — cleanup wired on all exit signals:
```ts
process.on('exit', cleanupAll);
process.on('SIGINT', () => { cleanupAll(); process.exit(0); });
process.on('SIGTERM', () => { cleanupAll(); process.exit(0); });
```

---

### ✅ 2B.3 — Drop `analyzeProject`, internalize `readProject`

`analyzeProject.ts` deleted. Both exports removed from `index.ts`. Neither tool appears in the agent tools array. `readProject.ts` kept on disk — still used internally at startup to build the system prompt.

---

### ✅ 2B.4 — Glob in `listFiles`

**File:** `CLI/src/tools/listFilesTool.ts`

Replaced manual `fs.readdirSync` walk with `fast-glob`. Tool now accepts:

```ts
schema: z.object({
    pattern: z.string().optional(),   // e.g. "src/**/*.ts"
    ignore: z.array(z.string()).optional(),
})
```

Default ignores: `node_modules/**`, `dist/**`, `build/**`, `.git/**`, `.next/**`.

Calling with no arguments still returns the full file tree — backwards compatible.

---

### ✅ 2B.5 — `webFetch` tool

**File:** `CLI/src/tools/webFetchTool.ts`

Fetches public URLs and returns readable content:
- HTML → converted to markdown via `turndown`
- Plain text / JSON / markdown → returned as-is
- Hard-blocked on non-http(s) schemes (`file://`, `ftp://`, etc.)
- 15s timeout via `AbortSignal.timeout`
- 20KB output cap

```ts
schema: z.object({
    url: z.string(),   // must start with http:// or https://
})
```

Registered in `agent.ts` tools array and `index.ts` exports.

---

---

## Phase 2C — Architecture layer

### ✅ 2C.0 — Planning Agent

`CLI/src/agents/planningAgent.ts` — reads existing `plan.md` if present, generates/updates it via `gpt-4o`, writes result to disk. Hard-blocked from writing source code files. Wired in `agent.ts` for `domain === 'planning'`.

---

### ✅ 2C.1 — LLM Classifier

`CLI/src/llm/classifier.ts` — `gpt-4o-mini` with `modelKwargs: { response_format: { type: 'json_object' } }`. Classifies into all 8 domains using last 3 turns of conversation (resolves anaphoric prompts). Returns `{ domain, confidence, reason, tokens }`. Falls back to regex silently on any failure or timeout. `route()` in `router.ts` is now async and calls classifier only when `confidence === 'low'`.

---

### ✅ 2C.2 — Validator Agent

`CLI/src/agents/validator.ts` — async `spawn`-based runner. Checks for `tsconfig.json` before running TSC, checks for ESLint config before running ESLint — skips silently if not found. Caps errors at 30 lines. Exports `runValidator()` → `ValidationResult` and `formatValidationErrors()`. No LLM involved.

---

### ✅ 2C.3 — Structured plan format

`CLI/src/agents/planner.ts` — returns `PlanStep[] | null` instead of free text. `null` means SIMPLE task. Graceful fallback: if LLM doesn't produce valid JSON, wraps the response as a single step. `CLI/src/agents/types.ts` holds shared types: `PlanStep`, `ExecutionGroup`, `Topology`.

---

### ✅ 2C.4 — Workflow Agent

`CLI/src/agents/workflow.ts` — pure algorithm (no LLM), topological sort on `depends_on` field. Steps at the same dependency level become a `parallel` group; sequential otherwise. Exports `buildTopology()`, `formatTopologyAsPlan()`, `topologySummary()`. Pipeline.tsx gains a **Workflow** card (mustard colour, badge `W`).

---

### ✅ 2C.5 — Reviewer → Judge

`CLI/src/agents/judge.ts` — replaces the simple reviewer. Returns structured `JudgeResult`:
```ts
{ verdict, failure_point, failure_step_id, reason, fix_hint, confidence, finalResponse }
```
`failure_point` is `'plan' | 'workflow' | 'executor' | 'final_output' | null`. Coder output capped at 500 chars before sending to Judge to save tokens. Pipeline.tsx Reviewer card renamed to **Judge** (rust colour, badge `J`).

---

### ✅ 2C.6 — Real StateGraph

`CLI/src/agents/graph.ts` rewritten as `StateGraph<GraphState>` using `@langchain/langgraph`. Five nodes: `planner → workflow → coder → validator → judge`. Conditional edges handle all retry and re-route logic. `MemorySaver` checkpointer persists state across node hops. `onToolCall` / `onStatus` callbacks stay in closure — not serialised into state. Graph returns `{ finalOutput, escalated, trajectory, ... }` object (not a bare string).

---

### ✅ 2C.7 — Escalation UI

`CLI/src/ui/EscalationCard.tsx` — rendered when Judge exhausts iterations or detects a repeated `failure_point`. `agent.ts` `chat()` accepts an `onEscalation` callback and fires it with `EscalationPayload` when `graphResult.escalated === true`. Shows trajectory of what was tried.

---

### ✅ 2C.8 — Review Agent

`CLI/src/agents/reviewer-agent.ts` — read-only analysis agent. Returns CRITICAL / WARNING / SUGGESTION formatted report. Wired in `agent.ts` for `domain === 'review'`.

---

### ✅ 2C.9 — Debugging Agent

`CLI/src/agents/debugger.ts` — investigate-first pattern: reproduce → diagnose → minimal patch → verify. Wired in `agent.ts` for `domain === 'debugging'`.

---

### ✅ 2C.10 — Refactoring Agent

`CLI/src/agents/refactorer.ts` — runs baseline tests before editing, applies structural-only changes, reverts if tests fail after. Wired in `agent.ts` for `domain === 'refactoring'`.

---

### ✅ 2C.11 — Git Agent

`CLI/src/agents/git-agent.ts` — bash-only, no file editing tools. Wired in `agent.ts` for `domain === 'git'`.

---

## Additional improvements found in agent.ts

Beyond what was in the plan, `agent.ts` also has:

| Feature | What it does |
|---|---|
| `tryDirectReadShortcut()` | Intercepts "read X" / "show X" prompts and calls `readFileTool` directly — no LLM round-trip |
| `trimHistory()` | Strips orphaned tool-call messages and enforces a 60KB char budget before sending history to the simple agent |
| `MAX_HISTORY_CHARS = 60_000` | Hard cap on context passed to simple agent |
| `onEscalation` param on `chat()` | Fires EscalationCard payload when graph detects repeated failure |

---

## Open issues noticed

All three open issues from the initial audit have been fixed:

| Issue | Fix applied |
|---|---|
| `coding \|\| complex` routing bug | `agent.ts:99` — removed `\|\| decision.tier === 'complex'` |
| Dead code `analyzeProject.ts` | File deleted, exports removed from `index.ts` |
| `preferredModel` silently ignored `gpt-4o-mini` | `router.ts:123` — removed `!== 'gpt-4o-mini'` clause |

---

---

## Phase 3A — Live Process Visualization

### ✅ 3A.1 — ProcessEvent type system

**File:** `CLI/src/processEvents.ts`

New shared type used by all agents and the UI:

```ts
export type StageKind = 'planner' | 'coder' | 'validator' | 'judge'
    | 'debugger' | 'reviewer' | 'refactorer' | 'git_agent';

export type ProcessEvent =
    | { type: 'stage_start'; stage: StageKind }
    | { type: 'reasoning';   stage: StageKind; text: string }
    | { type: 'tool';        stage: StageKind; tool: string; target: string }
    | { type: 'stage_done';  stage: StageKind };
```

---

### ✅ 3A.2 — ProcessTrace live UI component

**File:** `CLI/src/ui/ProcessTrace.tsx`

Ink component rendering stages in chronological order. Features:
- Spinner animation cycling `['◐','◓','◑','◒']` at 150ms for the active stage
- Filled bullet `●` for completed stages, hollow `○` for queued
- Reasoning text shown as italic lines
- Tool calls shown as `✓ toolName  target`
- Colour-coded by stage (planner=amber, coder=teal, validator=violet, judge=sage, etc.)

---

### ✅ 3A.3 — Stage events wired through all agents

**Files:** `CLI/src/agents/graph.ts`, `CLI/src/agent.ts`

`runAgentGraph()` accepts `onStageEvent` as a 6th param. Each graph node emits:
- `stage_start` on entry
- `reasoning` for planner steps and coder text
- `tool` for each tool call (with name + target extracted from args)
- `stage_done` on exit

Domain agents (reviewer, debugger, refactorer, git_agent) wired in `agent.ts`:
```ts
onStageEvent?.({ type: 'stage_start', stage: 'reviewer' });
// ... agent runs ...
onStageEvent?.({ type: 'stage_done', stage: 'reviewer' });
```

`chat()` in `agent.ts` accepts `onStageEvent` as 7th param and passes it through.

---

### ✅ 3A.4 — Trace frozen as message before reply

**File:** `CLI/src/ui/App.tsx`

Before the assistant reply is added to the message list, the accumulated
`stageEvents` array is frozen as a `{ role: 'trace', traceEvents }` message.
This preserves the pipeline trace in the chat history above each response.

```tsx
if (stageEvents.length > 0) {
    setMessages(prev => [...prev, { role: 'trace', content: '', traceEvents: [...stageEvents] }]);
}
setStageEvents([]);
setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
```

---

## Phase 3B — Testing

### ✅ 3B.1 — Block 5: All domain agents tested

Tested against `glitolltestrepo` (TypeScript CLI task manager):

| Agent | Test | Result |
|-------|------|--------|
| `/review` | Audit src/auth patterns | ✅ CRITICAL/WARNING report |
| `/debug` | Trace a runtime error | ✅ Diagnosed correctly |
| `/refactor` | Clean up taskService.ts | ✅ Refactored, committed |
| `/git` | Commit + push | ✅ add→commit→push flow |
| `/explain` | Explain trimHistory | ✅ Correct explanation, no edits |
| `/quick` | Simple JS question | ✅ Fast answer, no trace |

---

### ✅ 3B.2 — Block 6: Auto-routing verified

Verified that plain English prompts route to the correct domain without
slash commands:

| Prompt | Expected | Result |
|--------|----------|--------|
| "why does searchTasks not find by tag?" | DEBUGGER | ✅ |
| "look over storage.ts for issues" | REVIEWER | ✅ |
| "taskService.ts has repeated calls, clean it up" | REFACTORER | ✅ |
| "what changed in my last commit?" | GIT | ✅ |
| "how does nextId work?" | explanation | ✅ |
| "add a filterByPriority function" | CODER | ✅ |

---

## Phase 3C — Bug Fixes

### ✅ 3C.1 — CODER trace missing tool calls

**File:** `CLI/src/agents/coder.ts`

**Root cause:** `streamMode: 'values'` (the default) emits one chunk per
token — partial AIMessages don't have `tool_calls` set yet. Tool calls
only appear on the final complete message, by which point the trace had
already moved on.

**Fix:** Switched to `streamMode: 'updates'` which emits one complete
message per graph node step. `chunk.agent.messages` now contains a fully
formed AIMessage with `tool_calls` populated. Removed `prevMsgCount`
tracking — no longer needed.

```ts
const stream = await coderAgent.stream(
    { messages: [...] },
    { recursionLimit: 60, streamMode: 'updates' }  // ← was missing
);
// read chunk.agent?.messages instead of chunk.messages
```

---

### ✅ 3C.2 — Paste cursor jumping to beginning

**File:** `CLI/src/ui/App.tsx`

**Root cause:** `ink-text-input` v5 tracks cursor position internally as
`useState`. When `setInput(prev => prev + text)` was called externally
(Ctrl+V paste), the component saw the value grow but its cursor stayed at 0.

**Fix:** Added `inputKey` state counter. Incrementing it forces a remount
of `TextInput`, which re-initialises `cursorOffset` to `value.length`
(end of string). Also fixed a stale closure: `previousInputRef.current`
now uses `previousInputRef.current + text` instead of the stale `input` variable.

```tsx
<TextInput key={inputKey} ... />
```

---

### ✅ 3C.3 — Git agent push without add or commit

**File:** `CLI/src/agents/git-agent.ts`

**Root cause:** The push workflow section only said "run `git push`". No
staging or committing was included.

**Fix:** Rewrote both the commit and push workflow sections in the system prompt.
Push now runs: `git status` → `git add -A` → `git diff --staged` → propose
message → confirm → `git commit` → `git remote -v` check → `git push`.

---

### ✅ 3C.4 — Tokens/cost shows 0 for /plan

**Files:** `CLI/src/agents/planningAgent.ts`, `CLI/src/agent.ts`

**Root cause:** `runPlanningAgent()` called `llm.invoke()` but never
reported `usage_metadata` back to the caller.

**Fix:** Added optional `onUsage` callback parameter to `runPlanningAgent`.
Extracts `response.usage_metadata` after the LLM call and fires the callback.
`agent.ts` passes a callback that calls `onUsage` with token count and
estimated cost using `estimateCost('gpt-5.4', ...)`.

---

### ✅ 3C.5 — Hardcoded welcome screen stats

**File:** `CLI/src/ui/App.tsx`

**Root cause:** `files: 42`, `loc: '8.1k LOC · ts/tsx'`, and `branch: 'main'`
were hardcoded.

**Fix:** Added `getWorkspaceStats()` helper that runs at module load time:
- Branch: `git rev-parse --abbrev-ref HEAD`
- File count: `git ls-files | wc -l`
- LOC: `git ls-files | xargs wc -l | tail -1`

All wrapped in `try/catch` — falls back to defaults if not in a git repo.

---

## Phase 3D — Documentation

### ✅ 3D.1 — glitool.md

Full user-facing documentation covering all features: install, setup,
all slash commands, domain agents with example prompts, auto-routing,
tools, safety system, memory system, pipeline trace, configuration,
keyboard shortcuts, and a full example session.

---

### ✅ 3D.2 — AUTH_PLAN.md

Architecture plan for the next major version — moving from "bring your
own API key" to a managed auth platform. Covers device code flow (Option B),
backend schema, API routes, CLI changes, website pages, build order,
and open decisions.

---

### ✅ 3D.3 — README.md updated for v1.1.0

`CLI/README.md` rewritten to reflect the current feature set: all slash
commands, smart routing, multi-agent pipeline stages, tools table,
memory system, and configuration.

---

---

## Phase PA — Backend, Auth & Platform (v2.0.0)

### ✅ PA.1 — Express Server + MongoDB + Middleware Stack

**Files:** `server/src/index.ts`, `server/src/db.ts`, `server/src/models/index.ts`, `server/src/middleware/`

Express server on port 3000. MongoDB Atlas via Mongoose. Six models: User, AccessToken, DeviceCode, Usage, AnonUsage, Subscription. Two middleware: `validateToken` (checks Bearer token OR X-Anon-ID header), `checkUsageLimit` (enforces FREE_LIMIT=50, ANON_LIMIT=5). Health check at `/health`.

---

### ✅ PA.2 — GitHub OAuth

**File:** `server/src/routes/auth.ts`

Full GitHub OAuth flow. Routes: `GET /auth/github` (redirect to GitHub), `GET /auth/github/callback` (exchange code, create/update user, issue `glt_` access token). Token stored in MongoDB with 90-day expiry.

---

### ✅ PA.3 — Device Code Flow

**Files:** `server/src/routes/auth.ts`, `CLI/src/auth.ts`

Backend: `POST /auth/device` (generates device_code + user_code, 15min expiry), `POST /auth/device/poll` (CLI polls this until GitHub auth completes, returns access token + plan). CLI: `startDeviceFlow()`, `pollDeviceFlow()` — polls every 5s, handles pending/complete/expired states.

---

### ✅ PA.4 — Website /activate Page

**File:** `client/app/activate/page.tsx`

Next.js page for device code OAuth. User opens URL shown in terminal, enters code, authorizes GitHub. Page polls backend until auth complete then shows success. Handles expired codes.

---

### ✅ PA.5 — Anonymous Trial

**Files:** `CLI/src/auth.ts`, `CLI/src/ui/App.tsx`, `server/src/middleware/checkUsageLimit.ts`

UUID stored in `~/.glitool/anon.json`. Counter tracked locally. Limit gate in App.tsx blocks after 5 requests and shows signup prompt. Status bar shows `N free left` for anon users. Server enforces ANON_LIMIT=5 via X-Anon-ID header lookup in AnonUsage collection.

---

### ✅ PA.6 — AuthFlow.tsx + /signup Command

**Files:** `CLI/src/ui/AuthFlow.tsx`, `CLI/src/ui/App.tsx`

Ink component showing spinner + user code + activation URL while polling backend. Phases: loading → waiting → success/expired/error. `/signup` command triggers it. Esc cancels. On success: saves auth to `~/.glitool/auth.json`, status bar updates to show plan + email.

---

### ✅ PA.7 — Central LLM Factory

**File:** `CLI/src/llm/factory.ts`

`makeLlm()` and `makeInternalLlm()` exported. Three credential modes: BYOK (OPENAI_API_KEY → direct OpenAI), authenticated (glt_ token → Glitool backend), anonymous (X-Anon-ID header → Glitool backend). `makeInternalLlm()` adds `X-Glitool-Internal: true` header to bypass quota counting for classifier calls. All 9 agents updated to use `makeLlm()` instead of direct `new ChatOpenAI()`.

---

### ✅ PA.LLM — Together.ai Migration

**Files:** `server/src/routes/proxy.ts`, `CLI/src/llm/factory.ts`, `CLI/src/llm/router.ts`

Server proxy switched from OpenAI to Together.ai (`https://api.together.xyz/v1/chat/completions`, `TOGETHER_API_KEY`). `resolveModel()` added — maps incoming requests to correct Together.ai model by tier + domain:

| Tier | Domain | Model (originally planned) | Model (shipped — Together.ai serverless) |
|------|--------|---------------------------|------------------------------------------|
| All | Classifier (internal) | Llama 3.2 3B Turbo | **Qwen/Qwen2.5-7B-Instruct-Turbo** |
| Anon | Any | Llama 3.3 70B | **meta-llama/Llama-3.3-70B-Instruct-Turbo** |
| Free | Coding/debug/refactor | Qwen 2.5 Coder 72B | **openai/gpt-oss-20b** |
| Free | Everything else | Llama 3.3 70B | **meta-llama/Llama-3.3-70B-Instruct-Turbo** |
| Pro | Plan/review | DeepSeek V3 | **openai/gpt-oss-120b** |
| Pro | Coding/debug/refactor | Qwen 2.5 Coder 72B | **openai/gpt-oss-20b** |
| Pro | Everything else | Llama 3.3 70B | **meta-llama/Llama-3.3-70B-Instruct-Turbo** |

> **Why the substitutions:** Together.ai moved Llama-3.2-3B-Instruct-Turbo, Qwen2.5-Coder-72B-Instruct, and DeepSeek-V3 from serverless to dedicated-endpoint between strategy design and deploy. The shipped models are confirmed serverless as of 2026-05-24. See [LLM_STRATEGY.md](LLM_STRATEGY.md) for full rationale.

`logRequest()` added to proxy — logs model_requested, model_resolved, plan, tokens_in, tokens_out, latency_ms to server console on every request.

CLI router.ts `MODEL_BY_TIER` updated to Together.ai model names. `config.ts` default updated. `agent.ts` model names updated.

---

### ✅ PA.FIX — Together.ai Compatibility Fixes

Fixed all agents that bypassed `factory.ts` and hardcoded `OPENAI_API_KEY`:

| File | Fix |
|------|-----|
| `agents/explainer.ts` | Replaced `new ChatOpenAI({ apiKey: OPENAI_API_KEY })` → `makeLlm()` |
| `agents/planner.ts` | Same fix |
| `agents/reviewer.ts` | Same fix |
| `agents/planningAgent.ts` | Replaced fake `gpt-5.4` → `deepseek-ai/DeepSeek-V3` |
| `llm/classifier.ts` | Already used `makeInternalLlm()` — no change needed |
| `llm/router.ts` | Fixed CHAT_PATTERNS regex: `hi+` to match "hii", "hiiii" etc. |

Bug fixes:
- **Classifier consuming anon quota**: Added `X-Glitool-Internal: true` header in `makeInternalLlm()`. Server middleware skips quota check for internal calls.
- **BYOK users blocked at limit**: Added `isByok = !!process.env.OPENAI_API_KEY` check in App.tsx limit gate and anonLeft calculation.
- **`isStreaming` scope error in proxy.ts**: Moved declaration inside route handler before `resolvedModel`.

---

### ✅ PA.DOCS — Strategy Documentation

Three new decision documents created:

| File | Contents |
|------|----------|
| `LLM_STRATEGY.md` | Together.ai migration rationale, model roster, tier assignments, benchmarks, economics |
| `PAYMENT_PLAN.md` | Lemon Squeezy integration, pricing tiers, webhook events, build order |
| `DEPLOYMENT.md` | DigitalOcean + Vercel + glit.in setup, 13-phase deploy guide, cost summary |

---

---

## Phase DEV — Local Development Workflow (2026-05-25)

### ✅ DEV.1 — `start:dev` scripts across all three parts

| File | Script added | What it does |
|------|-------------|--------------|
| `server/package.json` | `start:dev` | `tsx watch src/index.ts` — hot reload |
| `client/package.json` | `start:dev` | `next dev -p 3001` — port 3001 (avoids conflict with server on 3000) |
| `package.json` (root) | `start:dev` | `concurrently` starts server + client together |

Run everything from repo root:
```bash
npm run start:dev
```

---

### ✅ DEV.2 — Lazy `backendUrl()` in factory.ts

**File:** `CLI/src/llm/factory.ts`

**Problem:** `BACKEND_URL` was captured as a module-level constant at import time — before `dotenv` in `index.tsx` had run. So `GLITOOL_BACKEND` in `~/.glitool/.env` was always ignored and the CLI always hit `api.glit.in`.

**Fix:** Replaced the constant with a function:
```ts
// Before — read too early, .env ignored
const BACKEND_URL = process.env.GLITOOL_BACKEND ?? 'https://api.glit.in';

// After — read lazily when each LLM call is made, .env works
function backendUrl(): string {
    return process.env.GLITOOL_BACKEND ?? 'https://api.glit.in';
}
```

All three `${BACKEND_URL}/v1` references changed to `${backendUrl()}/v1`.

---

### ✅ DEV.3 — server/.env.local for local dev config

`server/.env.local` created (gitignored). Loaded by `start:local` script via `dotenv-cli`:
```bash
"start:local": "dotenv -e .env.local -- tsx watch src/index.ts"
```

Key differences vs production `.env`:
- `CLIENT_URL=http://localhost:3001`
- Separate GitHub OAuth app with `http://localhost:3000/auth/github/callback`
- `GLITOOL_DEV_MONITOR=true`

---

### ✅ DEV.4 — CORS reads from CLIENT_URL env var

**File:** `server/src/index.ts`

CORS was hardcoded to only allow `glit.in`. Changed to also allow whatever `CLIENT_URL` is set to:
```ts
const allowedOrigins = process.env.CLIENT_URL
    ? [process.env.CLIENT_URL, 'https://glit.in', 'https://www.glit.in']
    : ['https://glit.in', 'https://www.glit.in'];
```

This lets `localhost:3001` through in local dev without touching production config.

---

### ✅ DEV.5 — Dev Monitor dashboard

New folder: `monitor/` — a standalone Express server (port 4000) + browser dashboard for real-time observability during local testing.

**What it shows:**
- Every event in a live timeline: user prompt → router → agent → tool calls → LLM calls → response → done
- Sessions grouped by user message
- Loop detection: highlights repeated tool+input combos in red, shows `LOOP ×N` badge
- Last-event timer: green (<5s), yellow (5-15s), red (15s+) — tells you if agent is stuck
- Active agent badge in header: shows current agent name, turns grey when done
- **Copy Session button** — copies entire session as formatted text for pasting to Claude for diagnosis

**Files:**
| File | What it does |
|------|-------------|
| `monitor/index.ts` | Express server, SSE stream, event store, DELETE /events |
| `monitor/public/index.html` | Dashboard UI — timeline + detail panel + all indicators |
| `monitor/package.json` | Express + tsx, `npm run start` |
| `CLI/src/monitor.ts` | `emit()` helper — POSTs events silently, no-op if monitor not running |

**Emit calls added in CLI:**

| Location | Event emitted |
|----------|--------------|
| `agent.ts` start of `chat()` | `user_prompt` |
| `agent.ts` after `route()` | `router` (domain, tier, model, reason) |
| `agent.ts` each domain `if` block | `agent` (name) |
| `agent.ts` `on_tool_start` stream event | `tool_call` (name, input, iteration) |
| `agent.ts` `on_chat_model_end` stream event | `llm_call` (tokens_in, tokens_out) |
| `agent.ts` before `return finalResponse` | `response` (text) + `done` (total_tokens) |
| `server/src/routes/proxy.ts` `logRequest()` | `llm_response` (model, plan, tokens, latency) |

**Enable with:**
```
GLITOOL_DEV_MONITOR=true   # in ~/.glitool/.env
GLITOOL_DEV_MONITOR=true   # in server/.env.local
```

---

### ✅ DEV.6 — Bug fixes found during local testing

| Bug | Fix |
|-----|-----|
| `~/.glitool/config.json` cached old `gpt-4o-mini` model name | Delete `~/.glitool/config.json` — CLI regenerates from defaults |
| Status bar shows wrong model (cosmetic) | Status bar shows `preferredModel` from config, not actual resolved model — monitor shows truth |
| `stream_options` missing → `tokens_in: 0` on server LLM events | Add `stream_options: { include_usage: true }` to Together.ai request body in `proxy.ts` |

---

## How to test locally

### One-time setup

```bash
# 1. Install monitor dependencies
cd monitor && npm install

# 2. Install root concurrently
cd .. && npm install

# 3. Create server/.env.local (copy server/.env, change CLIENT_URL)
# Add: GLITOOL_DEV_MONITOR=true

# 4. Add to ~/.glitool/.env:
#    GLITOOL_BACKEND=http://localhost:3000
#    GLITOOL_DEV_MONITOR=true

# 5. Build CLI
cd CLI && npm run build && npm install -g .
```

### Every test session

```bash
# Terminal 1 — monitor dashboard
cd monitor && npm run start
# Open http://localhost:4000 in browser

# Terminal 2 — backend
cd server && npm run start:local

# Terminal 3 — (optional) website
cd client && npm run start:dev
# Open http://localhost:3001

# Terminal 4 — use the CLI
glitool
```

### Fresh anonymous user test

```bash
# Reset to brand new anon user (no history, no auth)
rm -f ~/.glitool/auth.json ~/.glitool/anon.json && rm -rf ~/.glitool/sessions/
# Then run glitool — gets new UUID, 8 free requests
```

### Switch back to production

```bash
# Comment out GLITOOL_BACKEND in ~/.glitool/.env
# CLI will hit api.glit.in again
```

---

## Version history

| Version | Date | What changed |
|---------|------|-------------|
| 1.0.1 | 2026-05-14 | Initial release — basic agent + tools |
| 1.1.0 | 2026-05-20 | Multi-agent pipeline, domain agents, live trace, auto-routing, safety system, memory, all bug fixes |
| 2.0.0 | 2026-05-23 | ✅ Backend auth, Together.ai, anonymous trial, GitHub OAuth, device code flow. Deployed to https://api.glit.in and https://glit.in. |
| 2.0.1 | 2026-05-24 | ✅ Request-id dedup in proxy — 1 user prompt = 1 billing event despite ReAct iterations. Backend URL fix in CLI/src/auth.ts. |
| 2.0.2 | 2026-05-24 | ✅ Lazy LLM creation in agent.ts + explainer.ts. ANON_LIMIT 5→8. Friendly anon-limit message with correct glit.in URL. |
| 2.0.3 | 2026-05-25 | ✅ Prompt engineering pass — fixed planningAgent.ts critical bug, sharpened all 10 agent prompts (planner, coder, judge, debugger, refactorer, reviewer-agent, classifier, memory, projectMemory, explainer), deleted dead reviewer.ts. |
| 2.0.4-dev | 2026-05-25 | ✅ Local dev workflow — `start:dev` scripts, lazy backendUrl fix, `server/.env.local`, CORS env fix, Dev Monitor dashboard (port 4000) with loop detection + copy session, CLI monitor.ts emit system. Not published to npm — dev tooling only. |

---

## What is NOT done yet — Next steps

### Distribution (highest leverage today)
Most-used product wins. Without users, none of the below matters.

| Item | Effort | Why |
|------|--------|-----|
| Show HN post (well-titled) | 30 min | Launch-day visibility, 100-500 visits if title hooks |
| r/programming, r/commandline, r/typescript posts | 1 hour | Niche but real |
| 60-second demo GIF/video (asciinema or Loom) | 1 hour | Embed in README + posts |
| Landing page at https://glit.in/ (root currently parks) | 2 hours | Destination for traffic |
| Add UptimeRobot monitoring on api.glit.in/health | 5 min | Free, get email if down |

### Revenue (Pro tier — once free users exist)
Don't build before there's demand. Free tier covers 50 reqs/month, plenty for early users.

| Item | Blocked on | Est. time |
|------|-----------|-----------|
| PAY.1 — Lemon Squeezy account + product setup | None | 30 min |
| PAY.2 — server/src/routes/billing.ts + webhooks/lemonsqueezy.ts | PAY.1 | 2 hours |
| PAY.3 — client/app/upgrade/page.tsx | PAY.1 | 1 hour |
| PAY.4 — E2E payment test | PAY.2 + PAY.3 | 1 hour |

### v2.0.x remaining polish (mostly cosmetic)
| Item | Severity | Where |
|------|----------|-------|
| ~~LLM parrots file-ops on greetings~~ | ✅ Fixed in v2.0.3 (PE.6) | CLI/src/agent.ts |
| ~~Critical: planningAgent.ts placeholder bug~~ | ✅ Fixed in v2.0.3 (PE.1) | CLI/src/agents/planningAgent.ts |
| ~~All agent prompts polished~~ | ✅ Fixed in v2.0.3 (PE.2-PE.11) | CLI/src/agents/* |
| MODEL_BY_TIER in CLI sends deprecated names (server overrides — works, but UI/logs misleading) | Low | CLI/src/llm/router.ts:31-35 |
| planningAgent.ts still hardcodes `deepseek-ai/DeepSeek-V3` (server overrides) | Low | CLI/src/agents/planningAgent.ts:15 |
| Status bar token counter uses old gpt-4o-mini cost estimates | Low | CLI/src/agent.ts COST_PER_TOKEN |
| Local/server counter drift (~1 off in some flows) | Low | Residual non-deduped call path |
| /dashboard page (usage + plan info) | Low | per AUTH_PLAN.md |

### Phase 4+ (post-revenue, after distribution lands)

**New domain agents brainstormed during prompt-engineering pass** (each is a new slash command + agent file):

| Idea | Use case |
|------|----------|
| `/tests` | Generate tests for existing code, never modify source |
| `/docs` | Add JSDoc/TSDoc to exported functions |
| `/readme` | Generate README from project structure |
| `/security` | Focused security audit (OWASP + secrets + deps) |
| `/migrate <from> <to>` | Help upgrade between framework versions |
| `/onboard` | First-run project tour for new contributors |
| `/conflict` | Resolve git merge conflicts interactively |
| `/pr` | Generate PR description from `git diff` |
| `/commit-msg` | Standalone Conventional Commits generator |

See [ROADMAP.md](ROADMAP.md) for memory layers, RAG, multi-role agents, rescue mode, and web app.
