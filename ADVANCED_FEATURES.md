# Glitool — Advanced Feature Roadmap

Inspired by analysis of Claude Code's internal architecture (claw-code-main).
Features ordered by **impact vs. effort**, highest priority first.

---

## P1 — High Impact, Low Effort

### 1. Git Context Auto-Injected into System Prompt

**What:** Run `git status --short --branch` + `git diff --stat` once before any agent starts. Append the output to every agent's system prompt automatically.

**Why:** Right now agents waste 1–2 tool calls just discovering what files are modified. With git context pre-injected, the debugger/coder already knows which files changed before it touches a single tool.

**Where to implement:** `CLI/src/agent.ts` — before building the system prompt, run bash, inject into every agent's stateModifier.

**Example system prompt addition:**
```
## Current Git State
Branch: main (3 commits ahead of origin)
Modified: src/clarifier.ts, src/agent.ts
Untracked: src/tools/newTool.ts
```

**Effort:** ~20 lines of code. One `exec('git status --short --branch')` call.

---

### 2. CLAUDE.md Directory Walk-Up

**What:** When loading project instructions, walk up the directory tree (`./CLAUDE.md`, `../CLAUDE.md`, `../../CLAUDE.md`) until hitting home or filesystem root. Deduplicate by content hash. Enforce 12KB total cap, 4KB per file.

**Why:** If a user runs `glitool` inside `src/components/`, they currently miss the project root's `CLAUDE.md`. Walk-up ensures project instructions are always found regardless of working directory.

**Where to implement:** `CLI/src/agents/graph.ts` — inside `inspectProject()` or a new `loadInstructions()` function.

**Logic:**
```
cwd → parent → parent → ... → stop at $HOME or /
collect all CLAUDE.md files found
deduplicate by SHA-256 hash of content
truncate each to 4KB, total cap 12KB
inject into system prompt
```

**Effort:** ~30 lines. `path.dirname()` loop + `fs.existsSync()` checks.

---

### 3. Structured Session Compaction

**What:** When session history hits ~10K tokens, instead of just storing raw messages, compress the older half into a structured XML block and keep the last N messages verbatim.

**Current state:** Glitool saves sessions to `~/.glitool/sessions/` and loads them back as raw messages. No compression strategy.

**Structured summary format (borrowed from Claude Code):**
```xml
<summary>
Conversation summary:
- Messages compacted: 38 (user=15, assistant=15, tool=8)
- Tools used: bash, readFile, editFile, searchCode
- Recent user requests:
  - Fix the delete button not working
  - Add loading spinner to form submit
- Key files touched: task-page.html, styles.css
- Current work: Debugging UI interaction bugs in task manager
- Key timeline:
  - user: "the delete button is not working"
  - assistant: found render() call commented out on L121
  - tool editFile: re-enabled render(getFilteredTasks())
</summary>
```

**Continuation message injected at session start:**
```
This session is being continued from a previous conversation that ran out of context.
The summary below covers the earlier portion of the conversation.
[summary block]
Recent messages are preserved verbatim. Resume directly without asking the user any questions.
```

**Where to implement:** `CLI/src/memory.ts` — new `compactSession()` function called from `agent.ts` when `session_messages.length > 40`.

**Effort:** Medium (~80 lines). LLM call to summarize + replace old messages with XML block.

---

## P2 — High Impact, Medium Effort

### 4. LSP Diagnostics in System Prompt

**What:** Before the agent runs, query the project's Language Server Protocol (LSP) for all current diagnostics (TypeScript errors, ESLint warnings). Inject a diagnostics summary into the system prompt.

**Why:** The agent currently discovers errors only by running `npx tsc --noEmit` via bash. LSP gives it the full error list instantly — file, line, message — before it calls a single tool. Massively speeds up debugging sessions.

**Example system prompt addition:**
```
## Current Workspace Diagnostics (3 errors, 2 warnings)
ERROR  src/clarifier.ts:45   — Property 'codeContext' does not exist on type 'ClarifierResult'
ERROR  src/agent.ts:112      — Cannot find name 'loadSummary'
ERROR  src/tools/index.ts:8  — Module not found: './searchCodeTool.js'
WARN   src/router.ts:23      — Variable 'domain' is declared but never read
WARN   src/coder.ts:67       — Unreachable code detected
```

**How to implement:**
1. Spawn `typescript-language-server` as a child process (already installed in most TS projects via `npm`)
2. Send `initialize` + `textDocument/publishDiagnostics` LSP messages
3. Collect results, format as text, inject into system prompt
4. Shut down LSP server after collection

**Where to implement:** `CLI/src/lsp.ts` (new file) — `async function getWorkspaceDiagnostics(): Promise<string>`. Call from `agent.ts` before building system prompt.

**Libraries:** `vscode-languageclient` or raw stdio LSP protocol (no extra deps needed — it's just JSON-RPC over stdio).

**Effort:** ~150 lines. LSP initialization handshake + diagnostic collection + formatting.

---

### 5. Pre/Post Tool Hook System

**What:** Allow hook scripts to intercept tool calls. A pre-hook fires before execution and can deny it. A post-hook fires after and can annotate or deny the result.

**Hook contract:**
- Hook receives JSON via stdin: `{ hook_event: "PreToolUse", tool_name: "bash", tool_input: {...} }`
- Returns via stdout: any message to inject
- Exit code 0 = Allow, exit code 2 = Deny, anything else = Warn

**Configured in `.glitool/hooks.json`:**
```json
{
  "PreToolUse": ["./hooks/safety-check.sh"],
  "PostToolUse": ["./hooks/audit-log.sh"]
}
```

**Example use cases:**
- Pre-hook: block writes to `.env` files
- Pre-hook: require confirmation before `rm` commands
- Post-hook: auto-backup files before edits
- Post-hook: log all tool calls to an audit file

**Where to implement:** `CLI/src/hooks.ts` (new file). Call `runPreHook(toolName, input)` inside `agent.ts` before each tool execution, `runPostHook(toolName, input, output)` after.

**Effort:** ~100 lines. `child_process.spawnSync()` + JSON piping + exit code handling.

---

### 6. Per-Tool Permission Levels (Declared in Schema)

**What:** Instead of heuristic risk scoring (`riskScorer.ts` checking filename patterns), each tool declares its own minimum permission level.

**Permission tiers:**
```typescript
type PermissionLevel = 'read-only' | 'workspace-write' | 'danger-full-access';
```

**Tool definition change:**
```typescript
export const bashTool = {
    name: 'bash',
    permissionLevel: 'workspace-write',  // ← declared, not inferred
    schema: z.object({ command: z.string(), ... }),
    // ...
}

export const readFileTool = {
    name: 'readFile',
    permissionLevel: 'read-only',
    // ...
}
```

**Session-level mode:** Set at startup based on flags:
- `glitool --read-only` → only read-only tools allowed
- `glitool` (default) → workspace-write allowed
- `glitool --danger` → all tools allowed

**Why better than riskScorer:** O(1) lookup vs. regex analysis. Declarative intent, not guessing. Works correctly for new tools automatically.

**Where to implement:** `CLI/src/tools/*.ts` — add `permissionLevel` field to each tool. `CLI/src/permissions.ts` (new file) — simple check function.

**Effort:** ~60 lines + updating each tool definition.

---

## P3 — Medium Impact, Higher Effort

### 7. Plugin System — External Tool Extensions

**What:** Let users install plugins that add custom tools to Glitool without modifying source.

**Plugin structure:**
```
my-plugin/
  plugin.json        ← manifest
  tools/
    fetch-jira.sh   ← executable, reads JSON from stdin, writes result to stdout
```

**Plugin manifest (`plugin.json`):**
```json
{
  "name": "jira-tools",
  "version": "1.0.0",
  "tools": [
    {
      "name": "fetchJiraTicket",
      "description": "Fetch a Jira ticket by ID",
      "permissionLevel": "read-only",
      "command": "./tools/fetch-jira.sh",
      "schema": {
        "ticketId": { "type": "string" }
      }
    }
  ]
}
```

**Discovery:** Scan `~/.glitool/plugins/` at startup. Load all valid `plugin.json` manifests. Register tools into the tool pool.

**Execution:** Spawn the plugin script as a subprocess, pipe input JSON via stdin, read output from stdout. Timeout after 30s.

**Where to implement:**
- `CLI/src/plugins/loader.ts` — discovery and manifest parsing
- `CLI/src/plugins/executor.ts` — subprocess execution
- `CLI/src/agent.ts` — merge plugin tools into the tool list at startup

**Effort:** ~200 lines. File discovery + JSON validation + subprocess spawning.

---

### 8. Token Budget Tracking + Max-Budget Stop Reason

**What:** Track tokens used per request. When a session hits a budget (e.g. 50K tokens for free tier), stop gracefully with a clear message instead of failing mid-conversation.

**Stop reasons to add:**
- `max_turns_reached` — already exists via LangGraph `recursionLimit`
- `max_budget_reached` — new: token count exceeded tier limit
- `completed` — normal finish

**Per-request tracking:**
```typescript
interface RequestUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
```

**On budget exceeded:**
```
Sorry, this request has reached the token limit for your tier (50,000 tokens).
Your conversation history has been saved. Start a new session to continue.
```

**Where to implement:**
- `CLI/src/agent.ts` — accumulate usage from LLM responses
- `CLI/src/llm/factory.ts` — extract token counts from response metadata
- `server/src/middleware/checkUsageLimit.ts` — already tracks requests, extend to track tokens

**Effort:** ~80 lines. Token extraction from LangChain response metadata + stop condition check.

---

### 9. HTTP Control API — Remote Session Management

**What:** Extend the existing monitor server (`monitor/`) to also accept incoming messages and control the running agent. Today monitor is read-only (observes events). This makes it bidirectional.

**New endpoints (add to `monitor/server.ts`):**
```
POST /session/message     → inject a message into the running agent
POST /session/interrupt   → stop the current agent mid-run
GET  /session/history     → return full conversation history as JSON
DELETE /session           → clear session
```

**Use case:** A web UI (or another tool) sends a message to a running glitool session via HTTP instead of the terminal. Enables background agent runs, remote control, and multi-client observation.

**Where to implement:** `monitor/server.ts` — add routes that write to a shared message queue. `CLI/src/agent.ts` — poll the queue between turns.

**Effort:** ~150 lines. Express routes + shared in-memory queue + agent polling.

---

## Feature Reference Summary

| # | Feature | Priority | Effort | Files |
|---|---------|----------|--------|-------|
| 1 | Git context in system prompt | P1 | Low (20 lines) | `agent.ts` |
| 2 | CLAUDE.md directory walk-up | P1 | Low (30 lines) | `graph.ts` |
| 3 | Structured session compaction | P1 | Medium (80 lines) | `memory.ts`, `agent.ts` |
| 4 | LSP diagnostics in system prompt | P2 | Medium (150 lines) | `lsp.ts` (new) |
| 5 | Pre/Post tool hook system | P2 | Medium (100 lines) | `hooks.ts` (new) |
| 6 | Per-tool permission levels | P2 | Medium (60 lines) | `tools/*.ts`, `permissions.ts` |
| 7 | Plugin system | P3 | High (200 lines) | `plugins/` (new) |
| 8 | Token budget tracking | P3 | Medium (80 lines) | `agent.ts`, `factory.ts` |
| 9 | HTTP control API | P3 | Medium (150 lines) | `monitor/server.ts` |

---

## Not Needed Now — Future Consideration

### 10. MCP (Model Context Protocol) Support `[not needed now]`

**What:** Connect Glitool to external MCP servers — third-party tool providers that expose tools via a standard protocol. Any published MCP server (browser automation, Slack, GitHub, Linear, databases) becomes available as tools automatically.

```
glitool connects to → MCP server → exposes tools like:
  mcp__browser__navigate
  mcp__slack__send_message
  mcp__github__create_pr
```

**Why not now:** Requires a stable plugin system (#7) first. MCP is essentially the external version of plugins — build internal plugins first, then open to the MCP ecosystem.

**Why eventually:** Thousands of MCP servers already exist. Supporting the protocol would give Glitool access to a massive tool ecosystem for free, without building individual integrations.

---

### 11. Background / Daemon Mode `[not needed now]`

**What:** Start an agent task and detach. Agent runs in the background while the user does other work. Check results later.

```bash
glitool run "refactor the auth module" --background
# → Task ID: abc123, running in background...

glitool status abc123
# → In progress: 7 tool calls made, editing auth.ts...

glitool result abc123
# → Done. Changed 3 files.
```

**Why not now:** Glitool is a terminal chat tool — the blocking interactive model is the core UX. Background mode is only valuable once the tool is used for long, unattended tasks (multi-file refactors, scaffolding entire projects). Not the current use case.

**Why eventually:** Long coding tasks (generate a full feature, refactor a whole module) shouldn't require the user to watch a terminal. Background mode + notifications would unlock async workflows.

---

*Source: Analysis of Claude Code internal architecture via claw-code-main (instructkr/claw-code).  
Date: 2026-05-28*
