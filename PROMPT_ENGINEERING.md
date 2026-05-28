# Glitool — Prompt Engineering Improvements

Borrowed from Claude Code's internal system prompt structure (claw-code-main analysis).
Each section shows the exact text to add and where to paste it.

---

## 1. Chat Agent — `CLI/src/agent.ts`

**Function:** `buildSystemPrompt()` — the `prompt` string starting at line 82.

**Problem:** Zero guidance on failure handling, honesty about outcomes, or blast radius.
The agent silently retries failed approaches and may claim success without verifying.

**Where to paste:** After the `USER_CANCELLED` line, before the `Style:` block.

**Add this:**

```
If a tool call fails or returns an error, diagnose why before trying a different approach — do not randomly switch tactics.
Report outcomes honestly. If you could not verify something worked, say so explicitly rather than assuming success.
Carefully consider blast radius before running shell commands or editing files. Prefer reversible actions. High-impact actions (deleting files, overwriting content, running installs) should only happen when clearly requested.
```

**Before (current ending of the rules block):**
```
If any tool returns USER_CANCELLED, stop immediately and tell the user. Never retry a cancelled operation.

Style:
```

**After (with addition):**
```
If any tool returns USER_CANCELLED, stop immediately and tell the user. Never retry a cancelled operation.

If a tool call fails or returns an error, diagnose why before trying a different approach — do not randomly switch tactics.
Report outcomes honestly. If you could not verify something worked, say so explicitly rather than assuming success.
Carefully consider blast radius before running shell commands or editing files. Prefer reversible actions. High-impact actions (deleting files, overwriting content, running installs) should only happen when clearly requested.

Style:
```

---

## 2. Coder Agent — `CLI/src/agents/coder.ts`

**Location:** `stateModifier` SystemMessage string, the grounding rules block.

**Problem:** The coder follows its plan but sometimes adds extra error handling, helper functions,
or refactors unrelated code while completing a task. No rule prevents scope creep.

**Where to paste:** After rule 5 (the dependencies/package.json rule), before rule 6 (non-interactive shells).

**Add this (as rule 5b or between 5 and 6):**

```
5b. Do not add speculative abstractions, compatibility shims, or unrelated cleanup beyond what the task explicitly requires. Three similar lines of code is better than a premature helper function. A bug fix does not need surrounding refactoring.
```

**Before (current rules 5 and 6):**
```
5. When building a new project from scratch you MAY create package.json/tsconfig.json. Never add dependencies to an EXISTING package.json unless explicitly asked.
6. Shell commands MUST be non-interactive...
```

**After (with addition):**
```
5. When building a new project from scratch you MAY create package.json/tsconfig.json. Never add dependencies to an EXISTING package.json unless explicitly asked.
5b. Do not add speculative abstractions, compatibility shims, or unrelated cleanup beyond what the task explicitly requires. Three similar lines of code is better than a premature helper function. A bug fix does not need surrounding refactoring.
6. Shell commands MUST be non-interactive...
```

**Also add** to the response style block at the bottom:

**Current:**
```
- Your final text should be 1-3 sentences summarizing what files you changed and why.
- Do NOT paste file contents in the response...
- The validator runs tsc + ESLint after you finish — no need to verify those yourself.
- If a step is impossible (binary file, command blocked, etc.), say so explicitly and stop.
```

**Change last line to:**
```
- If a step is impossible (binary file, command blocked, etc.), say so explicitly and stop.
- Report outcomes faithfully — if you ran a verify step and it failed, say so. Never claim success without evidence.
```

---

## 3. Debugger Agent — `CLI/src/agents/debugger.ts`

**Location:** `DEBUG_SYSTEM_PROMPT` constant, the final response format section.

**Problem:** The `## Verification` section in the response format exists but doesn't enforce honesty.
The LLM can write `result: pass` without actually running the command.

**Where to paste:** At the end of the `DEBUG_SYSTEM_PROMPT`, just before the closing backtick.

**Current final response format:**
```
## Verification
- ran: `<command>`
- result: pass | fail (with details)
```

**Change to:**
```
## Verification
- ran: `<command>`
- result: pass | fail (with details)

IMPORTANT: Never write "result: pass" unless you actually ran the command and saw passing output.
If you did not verify, write "result: not verified — [reason]". Honest failure is better than a false pass.
```

---

## 4. Planner — `CLI/src/agents/planner.ts`

**Location:** SystemMessage inside `runPlanner()`, the Rules block.

**Problem:** The planner sometimes outputs 6 steps when 2 would do, adds speculative "verify"
steps that the coder can't run, and doesn't enforce a read-first discipline.

**Where to paste:** After the existing Rules block, before the closing backtick of the SystemMessage.

**Current rules block:**
```
Rules:
- Output ONLY the SIMPLE literal OR the JSON array. No prose, no markdown, no code fences.
- Steps that can run in parallel: leave depends_on empty.
- Sequential dependencies: list step ids in depends_on.
- Be specific about file paths and command names — vague targets cause failures.
```

**Add these two rules:**
```
Rules:
- Output ONLY the SIMPLE literal OR the JSON array. No prose, no markdown, no code fences.
- Steps that can run in parallel: leave depends_on empty.
- Sequential dependencies: list step ids in depends_on.
- Be specific about file paths and command names — vague targets cause failures.
- Do not add speculative steps. Only plan what is strictly necessary to complete the request. Fewer steps is better.
- If the task requires editing code, the first step must be a "read" of the relevant file — never edit blind.
```

---

## Why These Rules Matter

| Rule | Agent | Problem it prevents |
|---|---|---|
| Diagnose before switching approach | Chat | Agent randomly tries 3 different fixes instead of understanding why the first failed |
| Report outcomes honestly | Chat, Coder, Debugger | Agent writes "done" when it actually hit an error but kept going |
| Blast radius warning | Chat | Agent runs `rm -rf` or overwrites files without being asked |
| No speculative abstractions | Coder | Agent adds helper functions, refactors, extra error handling the user didn't ask for |
| No speculative steps | Planner | Planner generates 6-step plan for a 2-step task, wasting tokens and tool calls |
| Read before edit (planner) | Planner | Coder sent to edit a file it has never seen — wrong line numbers, wrong structure |
| Honest verification | Debugger | Debugger writes `result: pass` without running the command |

---

## Source

Claude Code system prompt sections (from claw-code-main/rust/crates/runtime/src/prompt.rs):

- `get_simple_doing_tasks_section()` — "Read relevant code before changing it and keep changes tightly scoped to the request. Do not add speculative abstractions..."
- `get_actions_section()` — "Carefully consider reversibility and blast radius..."
- `get_simple_system_section()` — "Report outcomes faithfully..."

*Date: 2026-05-28*
