# Glitool Tool Strategy

Companion to [ARCHITECTURE.md](ARCHITECTURE.md). Covers what tools the agent has, what to add, what to drop, and the exact build order.

---

## 1. Guiding principle

**More tools is not better.** Tool sprawl confuses the LLM — every extra tool eats tokens in the system prompt and adds one more option to weigh when deciding the next action. Claude Code ships ~12 tools, Cursor about the same. The rule is:

> Few orthogonal tools that compose, not one tool per scenario.

Don't build a `gitStatusTool`, `gitDiffTool`, `npmInstallTool`, `runTestsTool`. Build **one** `bashTool` and let the LLM compose. The LLM already knows git, npm, and test runners.

---

## 2. Current tool inventory

Located in [CLI/src/tools/](CLI/src/tools/).

| Tool | File | Verdict | Notes |
|---|---|---|---|
| readFile | [readFileTool.ts](CLI/src/tools/readFileTool.ts) | **Keep** | Essential. Path-sandboxed to `cwd`. |
| editFile | [editFileTool.ts](CLI/src/tools/editFileTool.ts) | **Keep** | String replace with confirm gate. |
| writeFile | [writeFileTool.ts](CLI/src/tools/writeFileTool.ts) | **Keep** | Full overwrite with confirm gate. |
| listFiles | [listFilesTool.ts](CLI/src/tools/listFilesTool.ts) | **Upgrade** | Add glob pattern support. |
| searchCode | [searchCodeTool.ts](CLI/src/tools/searchCodeTool.ts) | **Keep** | `grep` wrapper — correct design. |
| analyzeProject | [analyzeProject.ts](CLI/src/tools/analyzeProject.ts) | **Drop/merge** | Overlaps with readProject. |
| readProject | [readProject.ts](CLI/src/tools/readProject.ts) | **Internal-only** | Called once at startup, not LLM-callable. Move out of `tools/`. |

**Effective LLM-callable tools today: 5 file-system tools.** The agent can read, search, and edit files — but cannot run a single shell command. That is the hole.

---

## 3. Gap analysis vs Claude Code / Cursor

| Capability | Claude Code | Cursor | Glitool | Action |
|---|---|---|---|---|
| File read/write/edit | Yes | Yes | Yes | — |
| Grep | Yes | Yes | Yes | — |
| Glob | Yes | Yes | No | **Add to listFiles** |
| **Shell / Bash** | Yes | Yes | **No** | **Add — top priority** |
| Background processes | Yes | Yes | No | **Add — same tool as Bash** |
| WebFetch | Yes | Partial | No | **Add later** |
| WebSearch | Yes | Yes | No | Skip for v1 |
| Subagent / Task | Yes | No | Implicit | Skip — planner already covers it |
| TodoWrite | Yes | No | No | Skip — structured Plan covers it |
| Notebook edit | Yes | No | No | Skip — not the audience |

---

## 4. Why Bash is non-negotiable

Without a shell tool, the agent **cannot**:

- Run `tsc --noEmit` → the **Validator** stage in [ARCHITECTURE.md](ARCHITECTURE.md) is literally impossible to build
- Run `npm install`, `npm test`, `npm run build`
- Run `git status`, `git diff`, `git log` — no recovery awareness, no PR context
- Start a dev server to confirm a change actually works
- Run linters / formatters

Every coding agent has it. Add it **before** the Validator step in the roadmap, because the Validator just calls `bash("npx tsc --noEmit")` and `bash("npx eslint .")` — it does not need its own dedicated tool.

---

## 5. Going through the user's wishlist

| Item | Verdict | Reason |
|---|---|---|
| Persistent terminal session | **Skip** | Claude Code doesn't persist shell state and it's fine. Complexity > value. Use absolute paths. |
| File tools | Have them | — |
| Structured command output | Free with Bash design below | `{stdout, stderr, exitCode, durationMs}` |
| Git integration | **No dedicated tool** | Use Bash. LLM knows git. |
| Approval system | Already have | [riskScorer](CLI/src/trust/riskScorer.ts) + [confirmHandler](CLI/src/confirmHandler.ts) |
| Long-running process | **Add** | `runInBackground: true` flag on Bash |
| Streaming logs | **Add** | `readBackgroundOutput(handle, sinceMs)` companion |
| Context compression | Partly have | [memory.ts](CLI/src/memory.ts) summaries. Real win is auto-summarizing tool results. |
| Retry / error recovery | **Pattern, not tool** | Lives in executor loop |
| Planning loop | Have it | Planner agent |
| Sandboxing | Have it | Path-restricted. Bash needs its own sandbox rules. |
| Tool abstraction | **Pattern, not tool** | — |

---

## 6. Target tool set (v2)

8 LLM-callable tools — same ballpark as Claude Code and Cursor.

### Keep (4)
- `readFile`
- `editFile`
- `writeFile`
- `searchCode`

### Upgrade (1)
- `listFiles` → add glob patterns (`**/*.ts`, `src/**/*.tsx`)

### Drop / move (2)
- `analyzeProject` → delete (overlaps with readProject)
- `readProject` → keep as internal startup helper, remove from `tools/` index so the LLM does not see it

### Add (3)
1. **`bashTool`** — shell command execution with background mode and risk-scored allowlist. **Highest priority.**
2. **`readBackgroundOutput`** — companion for streaming logs from dev servers / long tests started via `bashTool`.
3. **`webFetch`** — URL → markdown. Low effort, high value when user pastes a docs/error link.

### Maybe add later (1)
4. `delegateTask` — already implicit in planner→coder. Only build if you want the coder to recursively spawn researchers. Not needed for v1.

### Do NOT add
- Dedicated git/npm/test/lint tools — Bash covers them
- WebSearch — adds paid API dependency (SerpAPI/Tavily) and a privacy story. Wait until users ask.
- TodoWrite — the structured Plan from the Workflow stage already serves this role
- Persistent shell session — complexity beats benefit
- Notebook editing tool — not your audience

---

## 7. Tool designs

### 7.1 `bashTool`

```ts
{
  name: 'bash',
  description: 'Run a shell command. Use for git, npm, tsc, eslint, tests, build tools.',
  input: {
    command: string,
    cwd?: string,              // defaults to process.cwd(), must stay inside it
    timeoutMs?: number,        // default 30s, max 300s
    runInBackground?: boolean, // default false
  },
  output: {
    // Foreground:
    stdout: string,
    stderr: string,
    exitCode: number,
    durationMs: number,
    truncated: boolean,        // true if output exceeded 10KB cap
    // OR Background:
    handle: string,            // pass to readBackgroundOutput
    pid: number,
  }
}
```

**Safety layer** (extend [riskScorer.ts](CLI/src/trust/riskScorer.ts)):

| Pattern | Action |
|---|---|
| `rm -rf`, `rm -r /`, `dd`, `mkfs`, `:(){:\|:&};:` | **Block hard** |
| `sudo`, `su `, `chmod 777`, `chown` | **Block hard** |
| `curl ... \| sh`, `wget ... \| bash`, `eval` from net | **Block hard** |
| `git push --force`, `git reset --hard`, `git clean -fd` | **Require confirm** |
| `npm install`, `npm uninstall`, `pip install` | **Require confirm** (modifies lockfile) |
| `npm publish`, `git push` (any), `docker push` | **Require confirm** |
| `cd` *outside* `cwd` | **Block** |
| Network egress to non-allowlisted hosts | Log + allow for v1, restrict later |
| Everything else | Allow |

Stream stdout/stderr to the UI tool log so the user sees progress.

### 7.2 `readBackgroundOutput`

```ts
{
  name: 'readBackgroundOutput',
  description: 'Read accumulated output from a backgrounded bash process.',
  input: {
    handle: string,
    sinceMs?: number,   // only return output produced in the last N ms
    killAfter?: boolean // optional: kill the process after reading
  },
  output: {
    stdout: string,
    stderr: string,
    running: boolean,
    exitCode: number | null,
  }
}
```

In-memory ring buffer per handle, capped at ~100KB. Drop oldest on overflow.

### 7.3 `webFetch`

```ts
{
  name: 'webFetch',
  description: 'Fetch a URL and return its content as markdown. Use for docs, error pages, GitHub READMEs.',
  input: {
    url: string,
    maxLengthKB?: number  // default 50
  },
  output: {
    markdown: string,
    title: string | null,
    truncated: boolean,
  }
}
```

Implementation: `fetch()` + `turndown` (HTML → markdown) + a small allowlist of schemes (`http`, `https` only). No file:// or local network unless the host explicitly opts in.

### 7.4 `listFiles` glob upgrade

```ts
{
  name: 'listFiles',
  input: {
    path?: string,        // default cwd
    pattern?: string,     // glob, e.g. "**/*.ts", "src/**/*.tsx"
    ignore?: string[],    // default ['node_modules/**', 'dist/**', '.git/**']
    maxResults?: number,  // default 200
  },
  output: { files: string[], truncated: boolean }
}
```

Use `fast-glob` or `globby` — battle-tested and respects `.gitignore`.

---

## 8. Build order (step by step)

Each step is small enough to ship in a single session.

### Step 1 — `bashTool` foundation **(1 day)**

**Files**
- Create [CLI/src/tools/bashTool.ts](CLI/src/tools/bashTool.ts)
- Update [CLI/src/tools/index.ts](CLI/src/tools/index.ts) to export it
- Update [CLI/src/trust/riskScorer.ts](CLI/src/trust/riskScorer.ts) with shell-command patterns
- Update [CLI/src/agent.ts](CLI/src/agent.ts) and [CLI/src/agents/coder.ts](CLI/src/agents/coder.ts) tool arrays

**Implementation**
- Wrap `child_process.spawn` (not `exec`) so we get stdout/stderr streams
- Foreground mode: collect output, enforce timeout, kill on overshoot
- Truncate output to 10KB with a `truncated: true` flag
- Risk check **before** spawn — hard blocks throw, confirm-required calls go through [confirmHandler](CLI/src/confirmHandler.ts)
- Surface the running command in the UI tool log

**Verify**
- `bash("ls")` works
- `bash("rm -rf /")` is blocked
- `bash("git push origin main")` triggers confirm
- `bash("npx tsc --noEmit")` returns the real type errors

### Step 2 — Background mode + `readBackgroundOutput` **(½ day)**

**Files**
- Extend [CLI/src/tools/bashTool.ts](CLI/src/tools/bashTool.ts) with `runInBackground`
- Create [CLI/src/tools/readBackgroundOutput.ts](CLI/src/tools/readBackgroundOutput.ts)
- Add a process registry module: `CLI/src/tools/processRegistry.ts` (Map<handle, { proc, stdout, stderr, exitCode }>)
- Register cleanup on session exit (kill all background processes)

**Verify**
- Start `npm run dev` in background, get a handle back
- Call `readBackgroundOutput(handle)` and see logs accumulate
- On `/exit` or Ctrl+C, all background processes die

### Step 3 — Drop `analyzeProject`, internalize `readProject` **(15 min)**

**Files**
- Delete [CLI/src/tools/analyzeProject.ts](CLI/src/tools/analyzeProject.ts)
- Move `readProject` out of [CLI/src/tools/index.ts](CLI/src/tools/index.ts) — keep the file, just don't export to the LLM
- Update [CLI/src/agent.ts](CLI/src/agent.ts) tool arrays
- Confirm `readProject` is still called from the startup path (it builds the initial system prompt)

**Verify**
- Tool count in startup banner drops to expected number
- Agent still has project context on first turn

### Step 4 — Glob upgrade on `listFiles` **(½ day)**

**Files**
- `npm i fast-glob` in `CLI/`
- Rewrite [CLI/src/tools/listFilesTool.ts](CLI/src/tools/listFilesTool.ts) to accept `pattern` and `ignore`
- Keep backward-compatible default (no pattern → list cwd)

**Verify**
- `listFiles({ pattern: "src/**/*.ts" })` returns only matching files
- `node_modules` and `dist` are ignored by default

### Step 5 — `webFetch` **(½ day)**

**Files**
- `npm i turndown` in `CLI/`
- Create [CLI/src/tools/webFetchTool.ts](CLI/src/tools/webFetchTool.ts)
- Update [CLI/src/tools/index.ts](CLI/src/tools/index.ts)
- Update agent tool arrays

**Verify**
- `webFetch({ url: "https://nodejs.org/api/fs.html" })` returns readable markdown
- `webFetch({ url: "file:///etc/passwd" })` is rejected
- Output is truncated at the configured limit

### Step 6 — Wire Validator on top of Bash **(1 day, depends on Steps 1–5)**

This is **Step 1 from [ARCHITECTURE.md](ARCHITECTURE.md)**'s build plan and only becomes possible after Step 1 here.

**Files**
- Create `CLI/src/agents/validator.ts`
- Calls `bashTool` with `npx tsc --noEmit` and `npx eslint .`
- Parses output into `ValidationResult` from the [ARCHITECTURE.md](ARCHITECTURE.md) schema
- Insert between Coder and Reviewer in [CLI/src/agents/graph.ts](CLI/src/agents/graph.ts)

**Verify**
- After a Coder run that introduces a type error, the Validator reports it
- Validator routes back to Coder with the error text in the feedback
- After a clean run, Validator reports `ok: true` and the pipeline proceeds

---

## 9. After this is done

The CLI is feature-complete for a real coding agent: file ops, shell, web, sandboxed, gated.

Next layers (from [ARCHITECTURE.md](ARCHITECTURE.md)) become buildable:

1. **Classifier** — decides simple-vs-complex routing
2. **Workflow** — sequences tools, picks parallel/conditional execution
3. **Judge** — reviews the trajectory and loops back to the failure point
4. **LangGraph** state machine with checkpointing

None of those need new *tools* — they need new *agents* that orchestrate the tools listed here.

---

## 10. Quick reference

```
KEEP:     readFile, editFile, writeFile, searchCode
UPGRADE:  listFiles (+ glob)
DROP:     analyzeProject
INTERNAL: readProject (not LLM-callable)
ADD:      bashTool, readBackgroundOutput, webFetch
LATER:    delegateTask (only if needed)
SKIP:     webSearch, todoWrite, persistent shell, gitTool, notebookEdit
```

**Build order:** Bash → background → drop analyzeProject → glob → webFetch → Validator.

**Why this order:** Each step is independently verifiable, Bash unblocks the rest of the [ARCHITECTURE.md](ARCHITECTURE.md) roadmap, and nothing requires breaking changes to the existing agent loop.
