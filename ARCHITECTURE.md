# Glitool — Agent Architecture

This document describes the target agent architecture for Glitool and the step-by-step plan to build it from where the codebase is today.

It is the engineering counterpart to `ROADMAP.md`. The roadmap is about features and phases. This document is about how the agent thinks, where state lives, and how nodes talk to each other.

---

## 1. What Glitool's agent has to do

Glitool is a CLI coding assistant. A user types a prompt and the agent has to:

1. Figure out whether the prompt is trivial chat or a real coding task.
2. If it is real work, produce a plan.
3. Decide how to execute that plan (sequential, parallel, conditional).
4. Run the plan using file-system tools, asking the user to confirm any write.
5. Verify the result with real checks (`tsc`, `eslint`, tests) before declaring success.
6. Have an LLM judge look at the whole trajectory and either approve or route the agent back to the failing stage.
7. Save what it learned to memory so the next session is smarter.

The architecture below is built around those seven jobs.

---

## 2. Current state (what already exists)

Today the agent has two paths:

- **Simple path** — `route()` is a regex-only classifier. For chat / quick explanations a single `createReactAgent` streams tokens back to the user.
- **Graph path** — for coding/complex prompts a procedural `while` loop in `agents/graph.ts` runs Planner → Coder → Reviewer, with up to 2 retry iterations.

What works:
- Risk scoring (`trust/riskScorer.ts`)
- Per-write user confirmation (`confirmHandler.ts` + `ConfirmCard.tsx`)
- Session summary + project memory persistence
- Streaming UI with tool log, pipeline cards, slash palette

What does not work or is missing:
- Planner/Coder/Reviewer hard-code `gpt-5.4` and `gpt-5.4-mini`, which are not real OpenAI model IDs. **Any coding path throws at runtime today.**
- No structured plan format — the Planner emits free-form text.
- No "workflow topology" stage — everything is sequential.
- No real validation — Reviewer is the only quality gate, and it never sees compiler or lint output.
- No targeted resumption — when Reviewer rejects, the entire Coder is rerun.
- `@langchain/langgraph` is in dependencies but unused. `graph.ts` is a procedural function, not a real state graph.

---

## 3. Target architecture — the full pipeline

```
                          ┌──────────────────┐
                          │   User prompt    │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │   Fast-path      │  regex / slash cmd / greeting
                          │   detector       │  length<20 ? → simple
                          └────────┬─────────┘
                                   │
                  ┌────────────────┴────────────────┐
                  │ obvious                          │ ambiguous
                  ▼                                  ▼
          ┌──────────────┐                ┌────────────────────┐
          │ Simple ReAct │                │   Classifier LLM   │  cheap model
          │  (streaming) │                │   returns JSON:    │  one call
          │              │                │   {complex, conf,  │
          │   reply ─────┼──► to user     │    hint}           │
          └──────────────┘                └─────────┬──────────┘
                                                    │
                                ┌───────────────────┴────────────────────┐
                                │ simple (or conf<0.6 → default complex) │ complex
                                ▼                                        ▼
                       ┌──────────────────┐                  ┌─────────────────────┐
                       │  Simple ReAct    │                  │     PIPELINE        │
                       │  (streaming)     │                  │   (see §4)          │
                       └────────┬─────────┘                  └──────────┬──────────┘
                                │                                        │
                                └──────────┬─────────────────────────────┘
                                           ▼
                                  ┌────────────────┐
                                  │ Memory update  │  session summary +
                                  │  (on exit)     │  project memory (LLM)
                                  └────────┬───────┘
                                           ▼
                                       user sees
                                        reply
```

---

## 4. The complex-task pipeline

When the Classifier returns `complex: true`, control enters the pipeline below.

```
                  Classifier said "complex"
                            │
                            ▼
            ┌───────────────────────────────┐
            │       1. Planner              │  strong model
            │  ───────────────────────────  │  output: structured plan
            │  output: Step[]               │
            │  [{id, action, target,        │
            │    depends_on, why}, ...]     │
            └───────────────┬───────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │       2. Workflow             │  separate LLM call
            │  ───────────────────────────  │  output: topology
            │  • read plan                  │
            │  • decide topology:           │
            │    - sequential edges         │
            │    - parallel groups          │
            │    - conditional branches     │
            │  • output: DAG JSON           │
            └───────────────┬───────────────┘
                            │
                            ▼
        ╔═══════════════════════════════════════════╗
        ║          3. Executor                      ║
        ║  ───────────────────────────────────────  ║
        ║   topology-aware DAG runner               ║
        ║                                           ║
        ║   ┌──── parallel group ────┐              ║
        ║   │ readFile  searchCode   │              ║
        ║   └────────────┬───────────┘              ║
        ║                ▼                          ║
        ║   ┌─ sequential ──────────┐               ║
        ║   │ editFile → writeFile  │               ║
        ║   └────────────┬──────────┘               ║
        ║                ▼                          ║
        ║   for each tool call:                     ║
        ║   ┌────────────────────────────┐          ║
        ║   │  riskScorer (free, regex)  │          ║
        ║   │   ├─ high → BLOCK          │          ║
        ║   │   └─ med/low → continue    │          ║
        ║   └────────────┬───────────────┘          ║
        ║                ▼                          ║
        ║   ┌────────────────────────────┐          ║
        ║   │  ConfirmCard (UI gate)     │          ║
        ║   │   user: y / n / d          │          ║
        ║   │   n → USER_CANCELLED       │          ║
        ║   └────────────┬───────────────┘          ║
        ║                ▼                          ║
        ║   record execution:                       ║
        ║   { step, tool, args, result, ok }        ║
        ╚════════════════╤══════════════════════════╝
                         │
                         ▼
            ┌───────────────────────────────┐
            │       4. Validator            │  NO LLM
            │  ───────────────────────────  │
            │  • tsc --noEmit (changed)     │
            │  • eslint (changed)           │
            │  • npm test (if applicable)   │
            │  • output: pass/fail + errs   │
            └───────────────┬───────────────┘
                            │
            ┌───────────────┴───────────────┐
            │ fail                          │ pass
            ▼                               ▼
   ┌─────────────────┐          ┌───────────────────────────────┐
   │ feed errors to  │          │       5. Judge                │  strong model
   │ Executor retry  │          │  ───────────────────────────  │
   │ (objective fix) │          │  input: trajectory JSON       │
   └────────┬────────┘          │   { request, classification,  │
            │                   │     plan, workflow,           │
            │                   │     executions[], validation, │
            │                   │     prev_verdicts[] }         │
            │                   │                               │
            │                   │  output:                      │
            │                   │   { verdict: ok | fail,       │
            │                   │     failure_point: enum,      │
            │                   │     reason, fix_hint,         │
            │                   │     confidence }              │
            │                   └─────────────┬─────────────────┘
            │                                 │
            │                                 ▼
            │                       ┌─────────────────┐
            │                       │  Route by       │
            │                       │  failure_point  │
            │                       └────────┬────────┘
            │                                │
            │       ┌─────────┬───────┬──────┼──────┬────────┐
            │       │ plan    │ work- │ tool │ code │ ok     │
            │       │         │ flow  │ exec │      │        │
            │       ▼         ▼       ▼      ▼      ▼        │
            │   ┌──────┐  ┌──────┐ ┌─────┐ ┌─────┐ ┌──────┐ │
            │   │ goto │  │ goto │ │goto │ │goto │ │ done │ │
            │   │ (1)  │  │ (2)  │ │ (3) │ │ (3) │ │      │ │
            │   │Plan  │  │Work- │ │Exec │ │Exec │ │pass  │ │
            │   │      │  │ flow │ │     │ │     │ │thru  │ │
            │   └──┬───┘  └──┬───┘ └──┬──┘ └──┬──┘ └──┬───┘ │
            │      │         │        │       │       │     │
            │      └─────────┴────┬───┴───────┘       │     │
            │                     │                    │     │
            │                     ▼                    │     │
            │           ┌──────────────────┐           │     │
            │           │ loop counter ++  │           │     │
            │           │ MAX = 3          │           │     │
            │           └────────┬─────────┘           │     │
            │                    │                     │     │
            │     ┌──────────────┴──────────┐          │     │
            │     │ < 3                     │ ≥ 3      │     │
            │     │                         ▼          │     │
            │     │                ┌────────────────┐  │     │
            │     │                │ Escalate to    │  │     │
            │     │                │ user with full │  │     │
            │     │                │ trajectory +   │  │     │
            │     │                │ Judge history  │  │     │
            │     │                └────────┬───────┘  │     │
            │     │                         │          │     │
            │     ▼                         ▼          ▼     ▼
            └─────loop─────────────►   user reply / handoff ─┘
```

---

## 5. The state object

Every node in the pipeline reads from and writes to a single state object. This is what makes targeted resumption possible — when the Judge says "fail at plan", we already have the previous executions on hand, we just discard the downstream state and re-enter at the Planner node.

```ts
type AgentState = {
  request: string;
  classification: ClassificationResult | null;     // set by Classifier
  plan: Step[] | null;                              // set by Planner
  workflow: Topology | null;                        // set by Workflow
  executions: ExecutionRecord[];                    // appended by Executor
  validation: ValidationResult | null;              // set by Validator
  judge_verdicts: JudgeVerdict[];                   // appended by Judge
  loop_count: number;                               // bumped on each retry
  final_reply: string | null;                       // set on exit
};

type Step = {
  id: number;
  action: 'read' | 'search' | 'edit' | 'write' | 'analyze';
  target: string;
  depends_on: number[];
  why: string;
};

type Topology = {
  nodes: number[];                  // step ids
  edges: { from: number; to: number; type: 'seq' | 'parallel' | 'cond' }[];
  parallel_groups: number[][];
};

type ExecutionRecord = {
  step_id: number;
  tool: string;
  args: Record<string, unknown>;
  result_summary: string;           // first 500 chars + diff
  ok: boolean;
  user_cancelled: boolean;
  blocked_by_risk: boolean;
  ts: string;
};

type ValidationResult = {
  tsc: { ok: boolean; errors: string[] };
  eslint: { ok: boolean; errors: string[] };
  tests: { ok: boolean; failed: string[] } | null;
};

type JudgeVerdict = {
  verdict: 'ok' | 'fail';
  failure_point:
    | 'plan' | 'workflow'
    | 'executor'              // pick a specific step_id below
    | 'final_output' | null;
  failure_step_id: number | null;
  reason: string;
  fix_hint: string;
  confidence: number;         // 0..1
};
```

---

## 6. The three loops

```
Loop A: ReAct inside the Executor
        tool → observation → next tool, until model stops calling tools
        bounded by LangGraph internals (max ~25 iters, token cap)

Loop B: Validator → Executor
        cheap, no LLM. If tsc/eslint fails, push errors back to Executor.
        Max 2 retries. Catches mechanical bugs.

Loop C: Judge → (Planner | Workflow | Executor)
        expensive, full LLM. The Judge reads the trajectory and routes
        execution back to a specific failure point.
        Max 3 retries. Catches semantic bugs.
```

Loop A and B are routine. Loop C is the new architectural piece.

---

## 7. Cross-cutting concerns

```
Every node writes to:
  Telemetry log  ──► ~/.glitool/routing.log.jsonl   (already exists)
  Tool log       ──► UI <ToolLog/>                  (already exists)
  Pipeline UI    ──► <Pipeline/>                    (needs new boxes)
  Cost meter     ──► statusBar tokens/$              (already in UI)

Every node reads from:
  System prompt  ◄── project memory + session summary  (already exists)
  Config         ◄── ~/.glitool/config.json            (already exists)
  Risk policy    ◄── HIGH_RISK_PATTERNS               (already exists)
```

---

## 8. Why this is feasible (and where it can fail)

The Judge pattern is well-documented in the literature (Reflexion, Voyager, Constitutional AI). LangGraph has primitives for it (`Command(goto=...)`). Feasibility is not the question. Engineering is.

Five real problems and the mitigations the design accounts for:

| Problem | Mitigation built into the design |
|---|---|
| Token explosion in Judge input | Executions store `result_summary` (500 chars + diff), not full content |
| Cascade misattribution (blame the last visible thing) | Judge returns ranked candidates with `confidence`; if multiple high-confidence candidates, escalate to user instead of guessing |
| Infinite loops | `MAX = 3` cap on Loop C; if same `failure_point` twice in a row, force escalation |
| Strictness calibration | Judge system prompt defines "good enough" explicitly: compiles + tests pass + does what user asked + no obvious bugs. Not "is this perfect." |
| Cost amplification | Loop C only runs after Validator passes (mechanical failures already filtered) |

---

## 9. Step-by-step build plan

The full pipeline is ~5–7 days of work in one go. Splitting it into shippable steps means each step is testable on its own, and the agent gets more reliable at each milestone.

### Step 0 — Prerequisites (half a day)

Before any new architecture lands, fix what is broken today.

- [ ] Replace the fake `gpt-5.4` / `gpt-5.4-mini` IDs in `agents/planner.ts`, `agents/coder.ts`, `agents/reviewer.ts`, `llm/router.ts` with real OpenAI model IDs. Recommended: `gpt-4o` and `gpt-4o-mini`.
- [ ] Fix `CLAUDE.md` drift: entry is `src/index.tsx` not `src/index.ts`, binary is `glitool` not `giltol`, env at `~/.glitool/.env` not `CLI/.env`.

**Verify:** run a coding prompt end to end without runtime errors.

### Step 1 — Validator node (1 day)

The single highest-leverage addition. No LLM. Catches ~60% of bugs before any Judge ceremony.

Files:
- Create `CLI/src/agents/validator.ts`
- Modify `CLI/src/agents/graph.ts` — call Validator after Coder

Behavior:
1. After the Coder finishes, look at the executions for any `editFile` or `writeFile` targets.
2. Run `tsc --noEmit` on the project. Collect errors. If only the changed files have errors, attribute them.
3. Run `eslint <changed-files>`. Collect errors.
4. If both pass, continue to Reviewer/Judge.
5. If either fails, append errors as a `HumanMessage` to the Coder's conversation and rerun the Coder once. Max 2 retries.

Wire to UI: add a fourth pipeline card after Coder for "Validator." Status: pass/fail with error count.

**Verify:** induce a deliberate TypeScript error in a generated edit and confirm the Coder reruns with the compiler output.

### Step 2 — Structured plan format (half a day)

The current Planner emits free-form text. The Workflow node and the Judge both need structured input.

Files:
- Modify `CLI/src/agents/planner.ts`

Behavior:
- Planner now returns JSON matching the `Step[]` schema in §5.
- Add a fallback: if JSON parse fails, treat the whole response as a single step.
- Update the Coder system prompt to read the structured plan.

**Verify:** print the parsed plan on a coding prompt and confirm it has shape `[{id, action, target, depends_on, why}]`.

### Step 3 — Classifier node (1 day)

Replace the regex router with a cheap LLM call for ambiguous prompts. Keep the regex as a fast-path.

Files:
- Modify `CLI/src/llm/router.ts` — keep the existing function, rename to `regexClassify`. Return `null` when the prompt is ambiguous.
- Create `CLI/src/agents/classifier.ts` — LLM call returning `{complex, confidence, hint}`.
- Modify `CLI/src/agent.ts` — try regex first, fall back to LLM classifier.

Behavior:
1. Slash commands, greetings, and length<20 → regex path → simple.
2. Everything else → one `gpt-4o-mini` call returning JSON.
3. If `confidence < 0.6`, default to `complex: true`.

**Verify:** log the chosen path in the telemetry file and check that 5 ambiguous prompts route correctly.

### Step 4 — Workflow node (1 day)

A separate LLM call that takes the structured plan and emits a DAG topology.

Files:
- Create `CLI/src/agents/workflow.ts`
- Modify `CLI/src/agents/graph.ts` — insert Workflow between Planner and Coder
- Add a Workflow card to `CLI/src/ui/Pipeline.tsx`

Behavior:
- Input: the Planner's `Step[]`.
- Output: `Topology` JSON. For v1, only support `seq` and `parallel`. Skip conditional.
- For each step, look at `depends_on`. Steps with no shared dependencies and read-only actions go into the same parallel group.

The Executor for v1 can still run everything sequentially — just record the topology so the Judge can see it. Real parallel execution is Step 6.

**Verify:** for a prompt that reads three files and edits one, the topology should put the three reads in one parallel group.

### Step 5 — Upgrade Reviewer to Judge (2 days)

This is the big change. Reviewer becomes Judge with localization.

Files:
- Rename `CLI/src/agents/reviewer.ts` to `CLI/src/agents/judge.ts`
- Modify `CLI/src/agents/graph.ts` — pass the full state to the Judge
- Add a Judge card to `CLI/src/ui/Pipeline.tsx`

Behavior:
- Input: full `AgentState`. Executions stored as summaries to keep token count bounded.
- Output: `JudgeVerdict` JSON matching the schema in §5.
- If `verdict: 'ok'`, return the final reply.
- If `verdict: 'fail'`, route based on `failure_point`:
  - `plan` → goto Planner
  - `workflow` → goto Workflow
  - `executor` → goto Executor at `failure_step_id`
  - `final_output` → goto Executor (rerun with hint)
- Track `loop_count`. If ≥ 3, escalate to user.
- If the same `failure_point` is flagged in two consecutive verdicts, escalate immediately — repeated failure at the same spot means more attempts won't help.

For Step 5, "goto Executor at step_id" can still rerun the whole Executor. True targeted resumption arrives in Step 6.

**Verify:** induce a failure (e.g. wrong import path) and confirm Judge identifies `final_output` as the failure point and the agent retries.

### Step 6 — Real state graph and targeted resumption (2 days)

Replace the procedural `while` loop in `graph.ts` with a real `StateGraph` from `@langchain/langgraph`. This unlocks parallel execution inside the Executor and proper `Command(goto=...)` for Judge resumption.

Files:
- Rewrite `CLI/src/agents/graph.ts` using `StateGraph<AgentState>`
- Add a checkpointer (`MemorySaver` is fine for now) so state survives mid-run

Behavior:
- Each agent (Classifier, Planner, Workflow, Executor, Validator, Judge) is a node.
- Edges are static; the Judge node returns a `Command` with a `goto` to choose where to resume.
- Parallel groups in the topology fan out as parallel branches inside the Executor.
- The checkpointer means a partial run can be resumed if the process dies.

**Verify:** print the LangGraph trace for a multi-iteration run and confirm `goto` correctly skips re-running the Planner when the failure is in the executor.

### Step 7 — Escalation UI (1 day)

When loop count hits the cap, surface the trajectory to the user.

Files:
- Create `CLI/src/ui/EscalationCard.tsx`
- Modify `CLI/src/ui/App.tsx` — render the card when escalation happens

Behavior:
- Show the user: original request, plan, what the Judge said in each iteration, current state.
- Offer three choices:
  - Approve as-is — accept the last attempt as the answer.
  - Give correction — open a text input, user types a hint, send back to Planner with the hint prepended.
  - Abort — drop the request, return to idle.

**Verify:** force three Judge failures and confirm the EscalationCard appears with the full trajectory.

---

## 10. What this changes vs the current code

| File | Change |
|---|---|
| `CLI/src/agents/planner.ts` | Output structured JSON instead of free text. Fix model ID. |
| `CLI/src/agents/coder.ts` | Read structured plan. Fix model ID. |
| `CLI/src/agents/reviewer.ts` | Renamed and rewritten as `judge.ts`. New JSON contract with `failure_point`. |
| `CLI/src/agents/graph.ts` | Rewritten as a LangGraph `StateGraph`. |
| `CLI/src/agents/classifier.ts` | **New.** LLM classifier behind the regex fast-path. |
| `CLI/src/agents/workflow.ts` | **New.** Plan → topology. |
| `CLI/src/agents/validator.ts` | **New.** Runs tsc / eslint / tests. |
| `CLI/src/llm/router.ts` | Keep regex, expose as `regexClassify`. Return null on ambiguity. |
| `CLI/src/ui/Pipeline.tsx` | Add cards for Classifier, Workflow, Validator, Judge. |
| `CLI/src/ui/EscalationCard.tsx` | **New.** Surfaces failed Judge loops to the user. |

Files that **do not change**:
- Tools (`readFile`, `writeFile`, `editFile`, `searchCode`, `listFiles`, `analyzeProject`, `readProject`) — already correct.
- `trust/riskScorer.ts` — already correct.
- `confirmHandler.ts` and `ConfirmCard.tsx` — already correct.
- `memory.ts` and `projectMemory.ts` — already correct.

---

## 11. Open questions for later

These do not block the build but should be revisited.

1. **Preservation vs discard on Judge resume.** When the Judge sends us back to the Planner, do we discard all downstream state, or try to preserve still-valid steps? Recommendation: discard for v1, optimize later.
2. **Ollama swap.** The roadmap calls for swapping OpenAI for Ollama. The architecture above is provider-agnostic; the model strings just change.
3. **Cost ceiling per request.** Today only iteration counts are capped. A request that triggers 50 file reads in the Executor is just as bad as 10 Judge loops. Add a token budget per request.
4. **Skill memory.** Recurring task patterns (e.g. "add a new endpoint") could be cached as templates and skip the Planner entirely. Out of scope for v1.

---

## 12. Quick reference

**Nodes (in execution order):**
Fast-path → Classifier → Planner → Workflow → Executor → Validator → Judge → Memory

**Loops:**
A) ReAct inside Executor · B) Validator → Executor (max 2) · C) Judge → upstream (max 3)

**Hard gates:**
1) Risk policy blocks writes to `.env`, configs, `.git/`
2) User confirm on every write/edit
3) Validator must pass before Judge can approve
4) Loop counter must be < cap to retry

**State:** single `AgentState` object threaded through every node.

**Targeted resumption:** Judge returns `failure_point`; router maps to the matching node via `Command(goto=...)`.
