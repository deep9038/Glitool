# TEST.md — Test Log & Diagnostic Record

This file tracks every issue, bug, and unexpected behavior found during the Glitool test sequence.
Each entry has a diagnosis and fix status so nothing gets lost.

---

## How to Add an Entry

Copy this template and fill it in:

```
### Issue #N — Short title
- **Phase:** Phase X — name
- **Test step:** Test X.Y
- **Command typed:** the exact command or prompt used
- **Expected:** what should have happened
- **Actual:** what actually happened (paste error or describe behavior)
- **Diagnosis:** root cause (fill after investigating)
- **Fix:** what was changed to fix it (or "pending")
- **Status:** open | fixed | wont-fix
```

---

## Phase 1 — CLI Subcommands

_No issues logged yet._

---

## Phase 2 — Planning Agent

_No issues logged yet._

---

## Phase 3 — Coding Graph

_No issues logged yet._

---

## Phase 4 — Tools

_No issues logged yet._

---

## Phase 5 — Domain Agents

_No issues logged yet._

---

## Phase 6 — Router Intelligence

_No issues logged yet._

---

## Phase 7 — Final Verification

_No issues logged yet._

---

## Known Issue Patterns (Reference)

Use this table to quickly match symptoms to likely causes.

| Symptom | Likely Cause | Where to Look |
|---|---|---|
| `model_not_found` error | Wrong model ID string | `CLI/src/llm/router.ts` — MODEL_BY_TIER |
| `Cannot find module` on startup | Missing npm package or wrong import path | Run `npm install` in CLI/, check `.js` extension on imports |
| Tool call fires but nothing happens | Tool not registered in agent tools array | `CLI/src/agent.ts` — tools array |
| Slash command not recognized | Command missing from EXPLICIT_ROUTES | `CLI/src/llm/router.ts` — EXPLICIT_ROUTES |
| Wrong domain routed (e.g. git goes to coding) | Regex pattern order conflict | `CLI/src/llm/router.ts` — detectDomain() |
| Planning agent writes code instead of plan | planningAgent blocked extension missing | `CLI/src/agents/planningAgent.ts` — BLOCKED_EXTENSIONS |
| Graph loops forever / hits recursion limit | Judge never returns verdict ok, escalation not triggering | `CLI/src/agents/graph.ts` — MAX_JUDGE_ITERATIONS |
| Background process handle not found | Process exited before read, or handle typo | `CLI/src/tools/processRegistry.ts` |
| webFetch returns empty string | Site blocked fetch or returned non-200 | `CLI/src/tools/webFetchTool.ts` — check Content-Type handling |
| Session not saving between runs | saveSession() not called, or path wrong | `CLI/src/memory.ts` |
| Validator runs but always passes | tsconfig.json not found, TSC skipped silently | `CLI/src/agents/validator.ts` — hasTsConfig() |
| Escalation card never shows | graphResult.escalated not true, onEscalation not wired | `CLI/src/agent.ts` — onEscalation callback |
| `USER_CANCELLED` not stopping tool chain | Agent retrying cancelled operation | `CLI/src/agent.ts` — system prompt instruction |

---

## Issue Log

_Add entries below as you find them during testing._

---
