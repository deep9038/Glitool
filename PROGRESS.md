# PROGRESS.md — What's been built

This file tracks only completed work — verified by reading the actual source files. Updated: 2026-05-14.

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

## What is NOT done yet

Everything from 2A.5 onward. See [ROADMAP.md](ROADMAP.md) for the full build order.

Next step: **2A.5** — extend router to detect all 8 domains + fix the `coding || complex` bug in `agent.ts`.
