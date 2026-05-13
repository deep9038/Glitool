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

**Goal:** Turn glitool from a UI shell into a real coding agent. Detail docs: [ROUTING.md](ROUTING.md), [TOOLS.md](TOOLS.md), [ARCHITECTURE.md](ARCHITECTURE.md).

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

## Phase 3 — Smart Memory & Beginner Mode (Weeks 5–7)

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

## Phase 4 — Multi-Role + RAG (Weeks 8–12)

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

## Phase 5 — Rescue + Freelance Modes (Weeks 13–16)

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

## Phase 6 — Production Hardening (Weeks 17–20)

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

## Phase 7 — Web App (Weeks 21+)

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
Build order:  2A.1 → 2A.2 → 2A.3 → 2A.4
              → 2B.1 → 2B.2 → 2B.3 → 2B.4 → 2B.5
              → 2C.1 → 2C.2 → 2C.3 → 2C.4 → 2C.5 → 2C.6 → 2C.7
              → 2D observe → Phase 3 → 4 → 5 → 6 → 7

Cross-refs:   ROUTING.md      → details for 2A
              TOOLS.md        → details for 2B
              ARCHITECTURE.md → details for 2C

Today's blocker:  2A.1 (15 minutes, unblocks the whole codebase)
```
