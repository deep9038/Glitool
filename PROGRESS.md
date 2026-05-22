# PROGRESS.md — What's been built

This file tracks only completed work — verified by reading the actual source files. Updated: 2026-05-22.

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

| Tier | Domain | Model |
|------|--------|-------|
| All | Classifier (internal) | Llama 3.2 3B Turbo |
| Anon | Any | Llama 3.3 70B |
| Free | Coding/debug/refactor | Qwen 2.5 Coder 72B |
| Free | Everything else | Llama 3.3 70B |
| Pro | Plan/review | DeepSeek V3 |
| Pro | Coding/debug/refactor | Qwen 2.5 Coder 72B |
| Pro | Everything else | Llama 3.3 70B |

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

## Version history

| Version | Date | What changed |
|---------|------|-------------|
| 1.0.1 | 2026-05-14 | Initial release — basic agent + tools |
| 1.1.0 | 2026-05-20 | Multi-agent pipeline, domain agents, live trace, auto-routing, safety system, memory, all bug fixes |
| 2.0.0 | 🔜 | Backend auth, Together.ai, anonymous trial, GitHub OAuth, device code flow, pro tier |

---

## What is NOT done yet — Next milestone (v2.0.0 launch)

| Item | Blocked on | Est. time |
|------|-----------|-----------|
| PA.8 — Deploy to DigitalOcean + glit.in | Buy domain ($6.99) + Droplet ($6) | 2-3 hours |
| PA.9 — E2E test on production | PA.8 | 1 hour |
| PA.10 — npm publish v2.0.0 | PA.9 | 30 min |
| PAY.1 — Lemon Squeezy account + product | PA.8 | 30 min |
| PAY.2 — /billing/checkout + /webhooks/ls | PAY.1 | 2 hours |
| PAY.3 — Website /upgrade page | PAY.1 | 1 hour |
| PAY.4 — E2E payment test | PAY.2 + PAY.3 | 1 hour |
| CLI rebuild after all fixes | Code fixes applied | 5 min |
