# DOMAINS.md — Glitool Domain Architecture

Companion to [ARCHITECTURE.md](ARCHITECTURE.md), [ROUTING.md](ROUTING.md), [MEMORY.md](MEMORY.md), [TOOLS.md](TOOLS.md).

This document defines all routing domains — what they are, how they are detected, what agent handles each, and what constraints apply.

---

## 1. What is a domain?

A domain is the **type of job** the user is asking the agent to do. The router detects it from the user's message and picks the right execution path. Different domains use different agents, different tools, and different rules.

Getting the domain wrong is expensive:
- Sending a debugging question through the coding pipeline wastes tokens on planning.
- Sending a review request through the coding pipeline risks unwanted file edits.
- Sending a refactor through without behavior-safety constraints risks breaking things silently.

---

## 2. All 8 domains

### 2.1 `chat`
**What it is:** General questions, discussions, opinions. No file operations needed.

**Trigger phrases:** "what do you think", "can you explain", "what is", "how does", "tell me about", "what's the difference"

**Agent:** Simple LLM — no tools.

**Model:** `gpt-4o-mini` (quick tier).

**Must NOT:** Write or read files, run commands, call the agent graph.

**Example:** "What's the difference between REST and GraphQL?"

---

### 2.2 `explanation`
**What it is:** Explaining specific code or a concept in the current project. May read a file but never edits.

**Trigger phrases:** "explain this", "walk me through", "how does X work", "what does this do", "break this down"

**Agent:** Simple LLM + `readFileTool`, `searchCodeTool`.

**Model:** `gpt-4o-mini`.

**Must NOT:** Edit files, run commands. Read-only.

**Example:** "Explain how the router decides which model to use."

---

### 2.3 `coding`
**What it is:** Building, implementing, or adding new features. The heaviest path.

**Trigger phrases:** "build", "create", "implement", "add", "write a function", "make a feature", "set up"

**Agent:** Full pipeline — Planner → Workflow → Coder → Validator → Judge.

**Model:** `gpt-4o` (complex tier).

**Tools:** All tools including bash, webFetch.

**Must NOT:** Skip validation. Must confirm before risky writes.

**Example:** "Build a user authentication system with JWT."

---

### 2.4 `planning`
**What it is:** Creating and iteratively refining a plan document. Collaborative loop — user and agent update a `.md` file together across multiple turns.

**Trigger phrases:** "plan", "design", "roadmap", "brainstorm", "think through", "architecture for", "let's figure out"

**Agent:** Planning Agent — generates plan → writes `plan.md` → reads + updates on follow-up turns.

**Model:** `gpt-4o`.

**Tools:** `readFileTool`, `writeFileTool`, `editFileTool`. No bash.

**Must NOT:** Write code files. Only `.md` planning documents.

**Loop behavior:**
- Turn 1: check if `plan.md` exists → generate plan → write file → summarize
- Turn 2+: read current `plan.md` → apply user's change → save → show what changed

**Example:** "Plan a payment system for my app." → "Add support for refunds." → "Change the currency handling to use Stripe."

---

### 2.5 `debugging`
**What it is:** Investigating why something is broken. Follows an investigate-first pattern — read errors, trace the cause, then patch. Different from coding which builds from scratch.

**Trigger phrases:** "why is this failing", "fix this error", "this crashes", "broken", "bug", "exception", "error:", "not working", "something's wrong"

**Agent:** Debug Agent — Read → Investigate → Diagnose → Patch.

**Model:** `gpt-4o`.

**Tools:** `readFileTool`, `searchCodeTool`, `bashTool` (run tests, check errors), `editFileTool`.

**Must NOT:** Add new features while fixing. Minimal targeted patch only.

**Order (strict):**
1. Read the error message / reproduce via bash
2. Search the codebase for the root cause
3. Explain the diagnosis to the user
4. Apply the minimal fix
5. Re-run the failing command to verify fix

**Example:** "Why does `glitool` crash when I pass a long prompt?"

---

### 2.6 `refactoring`
**What it is:** Improving the structure, readability, or performance of existing code — without changing what it does. Behavior must be preserved.

**Trigger phrases:** "clean this up", "simplify", "refactor", "restructure", "rename", "reduce duplication", "make this more readable", "extract", "split this"

**Agent:** Refactor Agent — Read → Plan minimal changes → Edit → Validate behavior unchanged.

**Model:** `gpt-4o`.

**Tools:** `readFileTool`, `searchCodeTool`, `editFileTool`, `bashTool` (run tests before and after).

**Must NOT:** Add new features. Must NOT change external behavior. Must run tests before and after.

**Safety rule:** If tests fail after refactoring, revert — never leave the codebase in a worse state.

**Order (strict):**
1. Read target files
2. Run existing tests (baseline)
3. Apply structural changes only
4. Run tests again
5. If tests pass → done. If fail → revert and explain.

**Example:** "Clean up the router.ts — it's getting hard to read."

---

### 2.7 `review`
**What it is:** Read-only analysis of code. No file writes ever. Returns findings, suggestions, risks.

**Trigger phrases:** "review this", "check for issues", "audit", "is this good", "what's wrong with", "code review", "security check", "look over"

**Agent:** Review Agent — Read → Analyse → Report.

**Model:** `gpt-4o`.

**Tools:** `readFileTool`, `searchCodeTool`, `bashTool` (tsc --noEmit, eslint — read output only).

**Must NOT:** Edit any files. Ever. Hard block on `writeFileTool`, `editFileTool`.

**Output format:**
```
## Summary
One-line verdict.

## Issues
- [CRITICAL] ...
- [WARNING] ...
- [SUGGESTION] ...

## What's good
...
```

**Example:** "Review my auth middleware — is it secure?"

---

### 2.8 `git`
**What it is:** Version control operations. Reading repo state, writing commit messages, staging, diffing, log inspection.

**Trigger phrases:** "commit", "what changed", "git diff", "write a commit message", "show me the history", "what's staged", "push", "branch", "merge"

**Agent:** Git Agent — bash-only, no file editing.

**Model:** `gpt-4o-mini` (standard tier — git commands are cheap).

**Tools:** `bashTool` only. No `readFileTool`, no `writeFileTool`, no `editFileTool`.

**Must NOT:** Edit source files. Only git commands and reading git output.

**Confirm-required:** `git push`, `git reset --hard`, `git rebase` — always needs user confirmation (bashTool's risk scorer already handles this).

**Example:** "Write me a commit message for what I just changed."

---

## 3. Domain map

```
User prompt
    │
    ├── chat          → Simple LLM (gpt-4o-mini, no tools)
    │
    ├── explanation   → Simple LLM + readFile + searchCode (read-only)
    │
    ├── planning      → Planning Agent (readFile + writeFile + editFile, .md only)
    │
    ├── review        → Review Agent (read-only + bash for lint/tsc, NO writes)
    │
    ├── git           → Git Agent (bash only, no file edits)
    │
    ├── debugging     → Debug Agent (read → diagnose → minimal patch → verify)
    │
    ├── refactoring   → Refactor Agent (read → edit → test → revert if broken)
    │
    └── coding        → Full pipeline (Planner → Workflow → Coder → Validator → Judge)
```

---

## 4. Domains skipped and why

| Skipped | Reason |
|---|---|
| `testing` | Close enough to `coding` — testing-focused system prompt in the coder is enough |
| `documentation` | Close enough to `planning` — same file-writing loop, same agent |
| `search` | `chat` + `listFiles` + `searchCode` tools already cover this |
| `deployment/ops` | `coding` + `bash` covers it. Not distinct enough to warrant a separate agent |

---

## 5. Routing detection

Each domain is detected in two stages (see [ROUTING.md](ROUTING.md)):

**Stage 1 — Regex (fast path):**

| Domain | Key signals |
|---|---|
| `coding` | "build", "create", "implement", "add feature", "write a" |
| `debugging` | "error:", "crash", "failing", "broken", "fix this", "exception", "not working" |
| `refactoring` | "refactor", "clean up", "simplify", "restructure", "rename", "extract" |
| `review` | "review", "audit", "check for issues", "is this good", "security" |
| `git` | "commit", "git", "what changed", "staged", "push", "branch", "diff" |
| `planning` | "plan", "design", "roadmap", "brainstorm", "architecture for" |
| `explanation` | "explain", "how does", "what does", "walk me through" |
| `chat` | fallback — nothing matched above |

**Stage 2 — LLM classifier (fallback for low-confidence):**
Passes the last 3 conversation turns + prompt to `gpt-4o-mini`. Returns structured JSON with domain + confidence. See [ROUTING.md §6](ROUTING.md) for full classifier design.

---

## 6. Agent constraints summary

| Domain | Can write files | Can run bash | Can call graph | Model |
|---|---|---|---|---|
| chat | ✗ | ✗ | ✗ | gpt-4o-mini |
| explanation | ✗ | ✗ | ✗ | gpt-4o-mini |
| planning | ✓ (.md only) | ✗ | ✗ | gpt-4o |
| review | ✗ | ✓ (read output only) | ✗ | gpt-4o |
| git | ✗ | ✓ (git only) | ✗ | gpt-4o-mini |
| debugging | ✓ (patch only) | ✓ | ✗ | gpt-4o |
| refactoring | ✓ (existing files only) | ✓ (tests only) | ✗ | gpt-4o |
| coding | ✓ | ✓ | ✓ | gpt-4o |

---

## 7. Build order

See [ROADMAP.md](ROADMAP.md) for full step details. Summary:

| Step | What | When |
|---|---|---|
| 2A.5 | Extend router to detect all 8 domains | After 2A.4 |
| 2C.0 | Planning Agent | Before 2C.1 |
| 2C.8 | Review Agent | After 2C.2 (needs bash) |
| 2C.9 | Debugging Agent | After 2C.2 (needs Validator) |
| 2C.10 | Refactoring Agent | After 2C.5 (needs Judge) |
| 2C.11 | Git Agent | After 2B.1 (needs bash) — can be built anytime from here |

---

**Status:** Design only. Router detection (2A.5) is the first thing to build.
