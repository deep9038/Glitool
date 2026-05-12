# ROUTING.md — Glitool routing strategy

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md) and [TOOLS.md](./TOOLS.md).
This doc captures the design decisions for **how user prompts get classified and dispatched to the right execution path** (simple agent vs planner→coder→reviewer graph) and the next concrete build steps.

---

## 1. Purpose

A router decides three things on every user turn:

1. **Domain** — chat / explanation / coding / planning
2. **Tier** — quick / standard / complex (drives which model is used and which workflow runs)
3. **Path** — single-shot `createReactAgent` or the full `runAgentGraph` pipeline

Good routing keeps cheap requests cheap and reserves the expensive planner→coder→reviewer loop for tasks that actually need it.

---

## 2. Current state (as of 2026-05-12)

Routing today is **two stages**:

### Stage 1 — `route(prompt)` in [CLI/src/llm/router.ts](CLI/src/llm/router.ts)

Pure-function, regex-based, no LLM call:

- `detectDomain` — first-match wins across four pattern buckets (CHAT, EXPLANATION, CODING, PLANNING). Falls back to `chat` when nothing matches.
- `scoreComplexity` — points for length (>300, >800), code fences, >5 newlines, planning keywords. Range ~0–6.
- `selectTier` — maps `(domain, score)` to `quick | standard | complex`.
- `getModel` — looks up `MODEL_BY_TIER`, with a `config.preferredModel` override.

Output:
```ts
RouteDecision { tier, domain, complexityScore, recommendedModel, reason }
```
Logged to `~/.glitool/routing.log.jsonl` via [telemetry.ts](CLI/src/llm/telemetry.ts).

### Stage 2 — execution fork in [CLI/src/agent.ts:88-99](CLI/src/agent.ts#L88-L99)

```
chat(userInput)
  ├─ route() → decision
  ├─ if (domain === 'coding' || tier === 'complex')
  │     → runAgentGraph()       // planner → coder → reviewer, up to 2 iterations
  └─ else
        → createReactAgent(decision.recommendedModel)   // streaming single-shot
```

---

## 3. Problems with the current router

| # | Problem | Where |
|---|---------|-------|
| 1 | Model IDs `gpt-5.4` / `gpt-5.4-mini` don't exist — any prompt routed to `standard` or `complex` crashes | [router.ts:27-28](CLI/src/llm/router.ts#L27-L28), [planner.ts:7](CLI/src/agents/planner.ts#L7), [coder.ts:10](CLI/src/agents/coder.ts#L10), [reviewer.ts:6](CLI/src/agents/reviewer.ts#L6) |
| 2 | Two routing systems disagree — `router.ts` picks a model by tier, but the graph hardcodes its own three model IDs | router.ts vs agents/*.ts |
| 3 | Regex is brittle — `"fix this typo"` triggers the full coder loop; `"build me a CLI"` defaults to chat | [router.ts:43-58](CLI/src/llm/router.ts#L43-L58) |
| 4 | `detectComplexity` is dead code — exported, never called | [router.ts:109-112](CLI/src/llm/router.ts#L109-L112) |
| 5 | No user escape hatch — no `/plan`, `/quick`, or model override flag | — |
| 6 | `preferredModel` override is half-broken — ignored when it equals `'gpt-4o-mini'` | [router.ts:19](CLI/src/llm/router.ts#L19) |
| 7 | No context awareness — `"could you make this faster"` is routed in isolation, with no idea what `this` refers to | [router.ts:91](CLI/src/llm/router.ts#L91) |
| 8 | No success/cost telemetry — only the decision is logged, never the outcome | [telemetry.ts](CLI/src/llm/telemetry.ts) |

---

## 4. Industry routing techniques

Eight families show up in production LLM agents. Most real systems combine 2–3.

| # | Technique | How it helps | How it backfires |
|---|-----------|--------------|------------------|
| 1 | Rule-based / regex | Free, <1ms, deterministic, debuggable | Brittle to paraphrasing; rule lists become unmanageable; false positives |
| 2 | LLM-as-classifier (cheap model) | Semantic understanding; handles paraphrasing; easy to extend | +200–800ms per turn; per-turn cost; can hallucinate categories; prompt-injection surface |
| 3 | Embedding similarity | ~50ms; no per-turn token cost; handles paraphrasing | Curated exemplars needed; drifts as domain evolves; silent failure on far-from-centroid prompts |
| 4 | Cascade / fallback (FrugalGPT) | Best cost/quality across population; cheap tier resolves 70–90% | Latency = sum of attempts on hard cases; threshold tuning is painful |
| 5 | Specialist sub-agents | Focused prompts, smaller tool subsets | Context loss across handoffs; coordination overhead; tasks spanning domains thrash |
| 6 | Cost / load-aware (provider routing) | Resilience, multi-provider failover | Solves ops, not task fit; quality drifts across providers silently |
| 7 | Tool-call-as-routing (ReAct) | Maximally flexible; no separate router code | Can loop forever; every turn pays the same; no upfront tier discrimination |
| 8 | Explicit user routing (modes / slash commands) | Zero ambiguity; power-user control; no classifier latency | Discoverability is poor; never a complete solution alone |

---

## 5. Decision: Option A — Hybrid (regex + LLM fallback)

**Why this over the alternatives:**

- **Pure regex (status quo)** can't handle paraphrasing.
- **Pure LLM classifier** adds ~300ms to every turn, including trivial ones.
- **Embedding similarity** needs curated exemplars Glitool doesn't have yet.
- **Hybrid** keeps the cheap path cheap and adds an LLM call only when the regex is uncertain.

The trade-off: more code paths to maintain. Acceptable for v2.

---

## 6. Hybrid router design — stages

### Stage 0 — Explicit user override (free, instant)

Slash commands short-circuit everything else:

```
"/plan refactor the auth layer" → forced { domain: 'planning', tier: 'complex' }
"/quick what does this regex do" → forced { domain: 'explanation', tier: 'quick' }
"/coder add a logout button"    → forced graph path
```

Implementation: new function `parseExplicitRoute(prompt)` called at the top of `route()`.

### Stage 1 — Regex pass (free, <1ms)

Run the existing `detectDomain` / `scoreComplexity` / `selectTier` pipeline. But also compute a **confidence** flag:

```
confidence = 'high' when:
  - any of CHAT/EXPLANATION/CODING/PLANNING patterns actually matched, OR
  - prompt.length < 20 (clearly trivial)

confidence = 'low' when:
  - detectDomain fell through to default 'chat' AND
  - prompt.length >= 20 AND
  - prompt isn't a greeting AND
  - prompt contains anaphoric references (this/that/it/the X you …)
```

The confidence flag turns the silent fallback into an explicit "I'm guessing."

### Stage 2 — Decide whether to escalate

```
confidence === 'high' → return regex decision (source: 'regex')
confidence === 'low'  → call Stage 3
```

Most prompts (greetings, clear coding verbs, slash commands) never reach Stage 3.

### Stage 3 — LLM classifier (new, ~300ms, ~$0.0001/call)

One call to `gpt-4o-mini` with structured output. The classifier **never answers the user's question** — it only classifies.

**Prompt shape:**

```
System: You are a request classifier. Return JSON only:
{
  "domain":      "chat" | "coding" | "explanation" | "planning",
  "tier":        "quick" | "standard" | "complex",
  "needs_tools": boolean,
  "reason":      "one short sentence"
}

Definitions:
- chat:        small talk, acknowledgements, meta commands
- coding:      will edit, create, fix, or refactor files
- explanation: read/understand code, answer a question, no file changes
- planning:    multi-step architecture, design, roadmap

Tiers:
- quick:    one short response, no tool use needed
- standard: a few tool calls, single-file scope
- complex:  multi-file changes, planning, or refactor

Recent conversation:
{{last 3 turns from sessionMessages}}

Current request: {{prompt}}
```

**Failure handling:**
- JSON parse failure → fall back to regex decision, source `'regex-fallback'`
- Timeout (cap at 3s) → same fallback
- Invalid enum value → reject and fall back

### Stage 4 — Execution fork (unchanged)

Same logic as today in `agent.ts`:

```
if (decision.domain === 'coding' || decision.tier === 'complex')
  → runAgentGraph()
else
  → createReactAgent(decision.recommendedModel)
```

The only effective change: `decision.recommendedModel` is now correct (assuming Step 1 model-ID fix is done).

---

## 7. The context problem

Routing a prompt like `"could you make this faster"` in isolation is impossible — *"this"* refers to something earlier in the conversation. The current router only sees the latest message.

### Two changes solve this

**a) Pronoun/reference detector in Stage 1**

Cheap regex signals that the message depends on prior context. These force `confidence = 'low'` even when other keywords match:

- `this`, `that`, `it`, `those`, `the previous`, `again`, `instead`
- Very short messages (≤6 words) following a substantive turn
- Imperatives without objects: `do it`, `fix it`, `redo`, `keep going`

**b) Stage 3 classifier sees recent history**

Pass `sessionMessages.slice(-6)` (last 3 turns each side) into the classifier prompt. Same eight-word input, different recent context → different correct route.

### Same words, different routes

Recent context = code edit:
```
"could you make this faster" → coding / standard → runAgentGraph
```

Recent context = explanation:
```
"could you make this faster" → chat / quick → simple agent
```

**Routing without context is a coin flip on follow-up messages.**

---

## 8. Telemetry requirements

Without these fields, you cannot tell if the hybrid is helping. Extend [telemetry.ts](CLI/src/llm/telemetry.ts):

| Field | Purpose |
|-------|---------|
| `source` | `'regex'` / `'llm'` / `'explicit'` / `'regex-fallback'` |
| `confidence` | `'high'` / `'low'` |
| `regex_said` | What Stage 1 returned even when Stage 3 overrode it |
| `llm_said` | What Stage 3 returned (when called) |
| `latency_ms` | Total routing time |
| `classifier_tokens` | Input + output tokens of the Stage 3 call |
| `escalation_reason` | Why Stage 3 ran (length / anaphora / no-match / etc.) |

After a week of usage you can answer:
- How often does the LLM actually run? (cost)
- How often does the LLM disagree with regex? (was escalation worth it?)
- Median latency penalty? (UX)
- Which prompts wrongly default to `chat`? (regex improvement opportunities)

---

## 9. Risks / how this backfires

1. **Latency on borderline prompts.** Every "low confidence" turn waits ~300ms before any real work starts. Mitigation: cap classifier timeout at 3s, always fall back to regex.
2. **Cost creep if regex regresses.** Deleting a pattern silently sends more prompts to Stage 3. Telemetry catches it.
3. **LLM hallucinates a category.** Structured output helps but isn't bulletproof. Validate the returned `domain` against the enum; reject and fall back.
4. **Prompt injection in user input.** A crafted message could trick the classifier. Low blast radius (worst case: wrong tier), but worth knowing.
5. **Stale conversation context misleads classifier.** If the user switched topics three turns ago, old context skews routing. Heuristic: detect topic shifts (long pauses, explicit "new question", first-person re-intros).
6. **Cost grows with conversation length** if you forget to truncate history.
7. **Privacy** — every classification now sends recent conversation to the LLM. Already true for the simple agent path, but worth flagging.
8. **Two systems disagreeing about model.** Stage 3 might pick `tier: standard`, but the planner/coder/reviewer still use hardcoded IDs. **Requires Step 2 (model unification) — otherwise the classifier output is partly ignored.**

---

## 10. Step-by-step build process

Effort estimates assume a single developer familiar with the codebase.

### Step 1 — Fix broken model IDs (15 min) — blocker

Without this, any prompt routed to `standard` or `complex` crashes on an invalid OpenAI model.

**Files to touch:**
- [CLI/src/llm/router.ts:27-28](CLI/src/llm/router.ts#L27-L28) — `gpt-5.4-mini` → `gpt-4o-mini`, `gpt-5.4` → `gpt-4o`
- [CLI/src/agents/planner.ts:7](CLI/src/agents/planner.ts#L7) — `gpt-5.4` → `gpt-4o`
- [CLI/src/agents/coder.ts:10](CLI/src/agents/coder.ts#L10) — `gpt-5.4-mini` → `gpt-4o-mini`
- [CLI/src/agents/reviewer.ts:6](CLI/src/agents/reviewer.ts#L6) — `gpt-5.4-mini` → `gpt-4o-mini`
- Fix `preferredModel` bug at [router.ts:19](CLI/src/llm/router.ts#L19) — drop the `userPref !== 'gpt-4o-mini'` clause

**Verify:** run `npm run dev`, send a coding prompt, confirm no model-not-found error.

---

### Step 2 — Unify model selection (30 min)

`runAgentGraph` should use the tier-selected model, not hardcoded constants.

**Files to touch:**
- [CLI/src/agents/graph.ts](CLI/src/agents/graph.ts) — accept `RouteDecision` as a parameter, pass `tier` to each agent
- [CLI/src/agents/planner.ts](CLI/src/agents/planner.ts), [coder.ts](CLI/src/agents/coder.ts), [reviewer.ts](CLI/src/agents/reviewer.ts) — accept a model name from the caller instead of constructing their LLM at module load
- [CLI/src/agent.ts:93](CLI/src/agent.ts#L93) — pass `decision` into `runAgentGraph`

**Decision rule for the graph:**
- Planner uses `complex` tier model
- Coder uses `decision.recommendedModel`
- Reviewer uses `standard` tier model

**Verify:** routing log shows the chosen model actually being used in the graph stages.

---

### Step 3 — Add slash command parsing — Stage 0 (1 hr)

Easy win, immediate user value, no LLM needed.

**Files to touch:**
- [CLI/src/llm/router.ts](CLI/src/llm/router.ts) — add `parseExplicitRoute(prompt)`. Return `null` if no slash command, else a fully-formed `RouteDecision` with `source: 'explicit'`.
- Wire it as the first check inside `route()`.

**Supported commands:**
- `/plan <prompt>` → planning / complex / graph path
- `/quick <prompt>` → chat / quick / simple path
- `/coder <prompt>` → coding / standard / graph path
- `/explain <prompt>` → explanation / quick / simple path

Strip the command prefix from the prompt before downstream use.

**Verify:** `/plan refactor auth` triggers graph path regardless of prompt content.

---

### Step 4 — Add `confidence` flag to regex stage (30 min)

Pure refactor, no behavior change yet — just produce the flag for Stage 2 to read.

**Files to touch:**
- [CLI/src/llm/router.ts](CLI/src/llm/router.ts) — extend `RouteDecision` with `confidence: 'high' | 'low'` and `source: 'regex' | 'llm' | 'explicit' | 'regex-fallback'`. Compute `confidence` based on the rules in §6 Stage 1.
- Add the pronoun/anaphora detector from §7a.

**Verify:** running today's prompts produces sensible `confidence` values in the log; behavior is unchanged.

---

### Step 5 — Add LLM classifier — Stage 3 (2 hr)

The new dependency. Behind a config flag so you can A/B it.

**Files to touch:**
- New file: `CLI/src/llm/classifier.ts` — exports `classifyWithLlm(prompt, recentMessages)`. Returns same shape as `RouteDecision`.
- [CLI/src/llm/router.ts](CLI/src/llm/router.ts) — make `route()` async. When `confidence === 'low'`, call `classifyWithLlm`. Validate output against the enum; on failure, fall back to regex result.
- [CLI/src/agent.ts:89](CLI/src/agent.ts#L89) — `const decision = await route(userInput, sessionMessages.slice(-6))`.
- [CLI/src/config.ts](CLI/src/config.ts) — add `routing.useLlmClassifier: boolean` (default true).

**Classifier model:** `gpt-4o-mini` with `response_format: { type: 'json_object' }`.

**Truncation:** cap classifier input at ~1000 tokens of recent conversation.

**Verify:** ambiguous prompts (`"make this faster"`, `"keep going"`) now route correctly given prior context.

---

### Step 6 — Extend telemetry (30 min)

**Files to touch:**
- [CLI/src/llm/telemetry.ts](CLI/src/llm/telemetry.ts) — add the fields from §8.

**Verify:** `~/.glitool/routing.log.jsonl` records source, confidence, regex_said, llm_said, latency, tokens, escalation_reason.

---

### Step 7 — Observe and iterate (1 week)

Run Glitool normally for a week. Then read `routing.log.jsonl` and answer:

- What % of turns hit Stage 3? (cost / latency)
- What % of Stage 3 disagrees with Stage 1? (was escalation valuable?)
- Which patterns silently default to chat most often? (add to regex)
- Are there new domains the classifier picks that you don't model? (extend taxonomy)

This data drives the next iteration. Do not skip this step — without it you're tuning by intuition.

---

## 11. What unlocks after this

A robust router is a prerequisite for several later items in [ARCHITECTURE.md](./ARCHITECTURE.md):

- **Classifier stage** (the ARCHITECTURE.md stage) is essentially Stage 3 of this router, generalized.
- **Workflow stage** can dispatch to different LangGraph subgraphs based on `domain`.
- **Cost dashboard** — the per-turn telemetry now contains enough to draw real cost/latency curves.
- **Judge upgrade** — the reviewer can check whether the *routing* was right, not just whether the code was right (e.g., did we use the planner when we should have used the simple path?).

---

## 12. Cheat sheet

```
Stage 0  parseExplicitRoute()   ← slash commands, forced route
Stage 1  detectDomain()         ← regex, free, sets confidence
Stage 2  if (low confidence)    ← decide to escalate
Stage 3  classifyWithLlm()      ← gpt-4o-mini, structured JSON, sees last 3 turns
Stage 4  agent.ts fork          ← runAgentGraph vs createReactAgent

Source flags: explicit > llm > regex > regex-fallback
Telemetry:    every turn logs source, confidence, latency, tokens, disagreement
Failure:      every stage falls back to the previous one; never crash the chat
```

Build order: **1 → 2 → 3 → 4 → 5 → 6 → 7**. Steps 1–2 are bug fixes; 3–6 are the hybrid; 7 is the feedback loop.
