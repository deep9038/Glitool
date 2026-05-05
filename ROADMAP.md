# Glitool — Production Roadmap

## Context

Glitool is an AI-powered coding agent CLI. The vision is to build an **affordable, beginner-friendly, privacy-aware coding assistant** that not only writes code but also teaches, reviews, and helps ship projects safely.

**Target audience (in order):**
1. **Individual developers, students, freelancers** — MVP focus
2. **Corporate offices** — later expansion with on-premise deployment and role-based access

**LLM Strategy:**
- **Testing (now):** `gpt-4o-mini` via OpenAI — reliable tool calling, $5 credit is enough
- **Production users:** Together AI — 10x cheaper, open-source models (Llama 3, Qwen, Mixtral), OpenAI-compatible API so switching is just a `baseURL` + `apiKey` change
- **Self-hosted (corporate):** Ollama on rented GPU (RunPod) — full privacy, no data leaves the server

**Business model:** Paid plans with India-friendly pricing tiers

Key principles driving every decision:
- **CLI first** — stabilize developer experience before building web UI
- **Privacy-aware** — support self-hosted LLMs so no data leaves the user's machine
- **Affordable** — open-source model routing to reduce cost
- **Trust & safety** — users always know what the agent is doing before it acts
- **Teach while building** — explain changes in simple language, not just execute them

---

## Current State (Honest Assessment)

| File | Issue |
|---|---|
| `CLI/src/agent.ts` | Hardcoded OpenAI, no error handling on tool calls, unused LangGraph import |
| `CLI/src/tools/readProject.ts` | Reads `.env` files (leaks secrets to LLM), no timeout on large projects |
| `CLI/src/tools/writeFileTool.ts` | Path traversal vulnerability — no check that path stays inside project |
| `CLI/src/tools/analyzeProject.ts` | Defined but never exported or used |
| `CLI/package.json` | Name is "cli" not "glitool", no tests, missing metadata |
| `.gitignore` | Missing `.next/`, logs, IDE files |
| Memory | In-memory only, lost on exit |
| Security | No auth, any user can write any file |
| Tests | 0% coverage |

---

## Phase 1 — Stabilize the CLI (Weeks 1–3) ✅

**Goal:** Make the current CLI reliable, safe, and switched to Ollama.

### 1.1 Critical Security Fixes

**File: `CLI/src/tools/readProject.ts`**
- Remove `.env` from `TEXT_EXTENSIONS` — secrets must never reach LLM context
- Add symlink protection to prevent infinite loops in `getFiles()`

**File: `CLI/src/tools/writeFileTool.ts`**
- Add path traversal guard:
  ```ts
  const projectRoot = process.cwd();
  if (!fullPath.startsWith(projectRoot)) throw new Error('Access denied: outside project root');
  ```

### 1.2 Switch from OpenAI to Ollama

**File: `CLI/src/agent.ts`**
- Replace `ChatOpenAI` with `ChatOllama` from `@langchain/ollama`
- Load model name from `.env` (`OLLAMA_MODEL=qwen2.5-coder`)
- Remove all OpenAI API key dependencies
- Default model: `qwen2.5-coder` (best open-source coding model)

```ts
import { ChatOllama } from '@langchain/ollama';
const llm = new ChatOllama({ model: process.env.OLLAMA_MODEL ?? 'qwen2.5-coder', temperature: 0 });
```

### 1.3 Graceful Ctrl+C Handling

**File: `CLI/src/index.ts`**
- Wrap `input()` in try-catch — `@inquirer/prompts` throws `ExitPromptError` on Ctrl+C instead of exiting cleanly
- Catch block should print `Bye!` and call `process.exit(0)`
- This prevents the ugly stack trace users currently see on Ctrl+C

### 1.4 Error Handling

**File: `CLI/src/agent.ts`**
- Wrap `tool.invoke()` in try-catch, push error as ToolMessage back to LLM (allows recovery)
- Add SIGINT handler so Ctrl+C stops spinner cleanly
- Add startup check: ping Ollama before starting session, show friendly error if not running

### 1.4 Persistent Session Memory

**New file: `CLI/src/memory.ts`**
- Save/load conversation history to `~/.glitool/sessions/<project-hash>.json`
- On startup: load last N messages from file
- On exit: save current messages
- This gives the LLM memory of previous sessions per project

### 1.5 Fix Package Config

**File: `CLI/package.json`**
- Rename `"name"` from `"cli"` to `"glitool"`
- Add `"engines": { "node": ">=18.0.0" }`
- Add `"prepublishOnly": "npm run build"` script
- Add `"files": ["dist/"]` to prevent src/ being published

### 1.6 Export & Use analyzeProject

**File: `CLI/src/tools/index.ts`**
- Add `export { analyzeProjectTool } from './analyzeProject.js'`
- Add to `tools` array in `agent.ts`
- Fix `execSync` calls to have `timeout: 10000` option

### 1.7 Smart File Reading (Token Optimization)

**Goal:** Replace `readProject` (reads everything) with focused tools that only read what's needed.

**Replace `readProject` with 3 tools:**

**New tool: `listFiles`** — `CLI/src/tools/listFilesTool.ts`
- Returns only folder structure, no file contents
- LLM calls this first to understand the project layout
- Very cheap — no file contents sent to LLM

**New tool: `readFile(path)`** — `CLI/src/tools/readFileTool.ts`
- Reads one specific file by path
- LLM only reads files it actually needs
- Schema: `{ filePath: string }`

**New tool: `searchCode(query)`** — `CLI/src/tools/searchCodeTool.ts`
- Searches all files for a keyword, function name, or string
- Returns file paths + matching lines
- LLM uses this to locate which file to read before reading it
- Schema: `{ query: string }`

**Expected flow:**
1. User asks to update a function
2. LLM calls `listFiles` → sees structure
3. LLM calls `searchCode("functionName")` → finds the file
4. LLM calls `readFile("src/utils.ts")` → reads only that file
5. LLM calls `writeFile` → updates it

**Impact:** Instead of reading all files every time, LLM reads only 1–2 files per task. Cuts token usage by 80–90%.

---

### 1.8 Patch-Based File Editing (Safe Writes)

**Goal:** Instead of replacing entire file contents, only change the specific section that needs updating.

**Add new tool: `editFile`** — `CLI/src/tools/editFileTool.ts`
- Finds `oldCode` in the file and replaces only that section with `newCode`
- Rest of the file stays completely untouched
- Schema: `{ filePath: string, oldCode: string, newCode: string }`

**Keep `writeFile` for new files only:**

| Tool | When LLM should use it |
|---|---|
| `writeFile` | Creating a brand new file from scratch |
| `editFile` | Updating existing code in an existing file |

**Benefits:**
- LLM only sends the changed section — fewer tokens
- No risk of accidentally deleting unrelated code
- Easier for user to review — only the diff changes
- Safer than full file replacement

**Files to update:**
- Create `CLI/src/tools/editFileTool.ts`
- Export from `CLI/src/tools/index.ts`
- Update `writeFile` description in `writeFileTool.ts` to say "for new files only"
- Update system prompt in `agent.ts` to instruct LLM when to use each tool

---

### 1.10 Human-in-the-Loop (HITL)

**Goal:** LLM should never write files or take actions without user confirmation.

**Level 1 — System prompt instructions**
- Tell LLM via system prompt to always ask clarifying questions before writing:
  - What file path to write to
  - What language/framework to use
  - Confirm before executing any file operation

**Level 2 — Confirmation in `writeFileTool.ts`**
- Before writing, show the user what will be written and ask for confirmation
- Use `@inquirer/prompts` `confirm()` to pause and wait for y/n
- Only write if user confirms

**Level 3 — LangGraph `interrupt()` (production-grade)**
- Use LangGraph's built-in `interrupt()` to pause the agent mid-execution
- Agent pauses before any tool call, shows the user what it's about to do
- User approves/edits/cancels before agent continues
- **Files:** `CLI/src/agent.ts` — add interrupt logic around tool nodes

---

## Phase 1.5 — CLI UX Polish (Weeks 3–4)

**Goal:** Make the CLI feel professional and comfortable to use daily before adding more features.

### 1.5.1 Colored Output

**Package:** `chalk`

**File: `CLI/src/index.ts`**
- Assistant replies in **cyan/green** — visually distinct from user input
- Tool call notifications in **yellow**
- Error messages in **red**
- Welcome banner in **bold**

```ts
import chalk from 'chalk';
console.log(chalk.cyan('Assistant: ') + reply);
```

### 1.5.2 Streaming Responses (Token by Token)

**File: `CLI/src/agent.ts`**
- Instead of waiting for full LLM response, stream tokens to terminal as they arrive
- User sees the reply being written in real time — feels much more responsive
- Remove `ora` spinner during response (replace with streaming text)
- Keep spinner only during tool execution (when LLM is thinking, not yet responding)

**How:** Use `agent.stream()` and detect `AIMessageChunk` events with partial content tokens.

### 1.5.3 Welcome Banner

**File: `CLI/src/index.ts`**
- On startup, show:
  ```
  ╔══════════════════════════╗
  ║   glitool v1.0.0         ║
  ║   model: gpt-5-mini      ║
  ║   project: my-app/       ║
  ╚══════════════════════════╝
  Type /help for commands. /exit to quit.
  ```
- Pull version from `package.json`
- Show current model name and working directory

### 1.5.4 Slash Commands

**File: `CLI/src/index.ts`**

Extend the slash command handler:

| Command | Action |
|---|---|
| `/exit` | Save session and quit (already works) |
| `/help` | List all available slash commands |
| `/clear` | Wipe current session memory and start fresh |
| `/model` | Show current model name |
| `/tools` | List all available tools the LLM can use |

### 1.5.5 Better Tool Call Display

**File: `CLI/src/index.ts`**
- Show tool name AND the key argument it was called with
- Pass argument info from `onToolCall` callback

```
⚙  readFile → src/agent.ts
⚙  searchCode → "createReactAgent"
⚙  writeFile → src/utils/helper.ts
```

Instead of the current generic: `Running tool: readFile...`

---

## Phase 2 — Smart Memory & Auto-Learning (Weeks 4–6)

**Goal:** Make the tool feel like it knows you — without forcing the user to configure anything manually.

**Core principle:** No setup required. Preferences are empty on day 1 and fill themselves in automatically as the LLM observes what the user actually does.

### 2.1 Session Summaries

**File: `CLI/src/memory.ts`** (upgrade existing)

Right now the full raw conversation is saved on exit. Instead:
- After each session ends, call the LLM with the conversation and ask it to extract a 2-3 sentence summary of what was built/decided
- Save only the summary, not 40 raw messages
- Next session: load the summary as context — LLM knows what you were working on without re-reading everything

**Example summary saved to disk:**
```
User is building a REST API in TypeScript using Express and Zod for validation.
They added a /users endpoint and fixed a path traversal bug in the file tool.
Next step is to add JWT authentication.
```

**Impact:** Keeps token usage flat across sessions regardless of how long you've been using the tool.

### 2.2 Auto-Learning Preferences

**No manual config commands. No setup wizard.**

After each session, the LLM also extracts observable preferences from the conversation:

```json
{
  "observedLanguages": ["TypeScript", "SQL"],
  "frameworks": ["Express", "Zod"],
  "codingStyle": "spaces",
  "commonPatterns": ["async/await", "zod schemas"],
  "lastActiveFolder": "src/api/",
  "projectType": "REST API"
}
```

**How it works:**
- Preferences file starts completely empty: `{}`
- After session 1: LLM fills in what it observed
- After session 2: LLM merges new observations with existing ones
- By session 3-4: LLM has a solid picture of how you work

**File: `CLI/src/preferences.ts`**
- `loadPreferences()` — reads `~/.glitool/preferences.json`
- `savePreferences(data)` — merges new observations with existing
- Preferences injected into system prompt at session start so LLM already knows your stack

**What NOT to store:** full chat history, raw logs, things that can be re-read from files.

### 2.3 Model Routing

**Goal:** Don't use the expensive model for everything — save cost automatically.

| Task type | Model |
|---|---|
| Simple question, quick lookup | cheap/fast model |
| Complex coding, refactoring | strong model |
| Summarizing session, extracting preferences | cheap model |

**New file: `CLI/src/llm/router.ts`**
- Classifies the user's message before sending to LLM
- Routes to cheap model for simple tasks, strong model for complex ones
- User never has to think about it — happens automatically

---

## Phase 3 — Multi-Role Agent & Trust Layer (Weeks 7–10)

**Goal:** Specialized sub-agents for different tasks + safety features that make users trust the tool.

### 3.1 Multi-Role Agent Architecture

Instead of one generic agent, use specialized sub-agents:

| Agent | Responsibility |
|---|---|
| **Planner** | Understands the task, breaks it into steps |
| **Coder** | Writes and edits code |
| **Reviewer** | Checks quality, catches mistakes |
| **Tester** | Runs tests, reports failures |
| **Security checker** | Flags risky code patterns |
| **Doc writer** | Generates comments, READMEs, changelogs |

**New file: `CLI/src/agents/`**
- `planner.ts` — uses strong model, outputs step-by-step plan
- `coder.ts` — executes each step using coding tools
- `reviewer.ts` — reviews output before presenting to user
- Only activates the agents needed for each task — no wasted tokens

**Flow:**
1. User asks something
2. Planner breaks it into steps
3. Coder executes each step
4. Reviewer checks the result
5. User sees final output with explanation

### 3.2 Trust & Safety Layer

**Risk scoring before execution:**
- Before any tool call, score the action (low / medium / high risk)
- Low risk (read file) → execute silently
- Medium risk (write new file) → show what will happen, ask confirm
- High risk (delete file, run command, edit config) → hard stop, require explicit approval

**Dependency safety warnings:**
- When LLM suggests `npm install <package>`, check the package:
  - Last publish date
  - Download count
  - Known vulnerabilities (via npm audit)
  - Warn user before installing

**Files:**
- `CLI/src/trust/riskScorer.ts`
- `CLI/src/trust/dependencyChecker.ts`

### 3.3 Beginner-Friendly Mode

**New flag: `giltol --explain`**
- After every code change, LLM explains in simple language:
  - What was changed and why
  - What the new code does
  - What concept to learn next
- Teaches while building — makes the tool useful for students and junior devs

---

## Phase 4 — RAG Over Office Data (Weeks 11–16)

**Goal:** Let the LLM query company databases and documents privately — for corporate office deployments.

### 3.1 Vector Store for Documents (PDF, Word)

**New file: `CLI/src/rag/documentLoader.ts`**
- Use `langchain/document_loaders/fs/pdf` and `langchain/document_loaders/fs/docx`
- Chunk documents with `RecursiveCharacterTextSplitter`
- Embed using a local Ollama embedding model (`nomic-embed-text`)
- Store vectors in **Chroma** (runs locally via Docker)

**New tool: `CLI/src/tools/searchDocsTool.ts`**
- LLM calls this tool with a query string
- Performs similarity search in Chroma
- Returns top-K relevant chunks
- Example usage: HR policy docs, SOPs, project documentation

### 3.2 SQL Database Connector

**New tool: `CLI/src/tools/queryDatabaseTool.ts`**
- Schema: `{ connectionString: string, query: string }`
- Use `pg` (Postgres) or `mysql2`
- **Security:** Only allow SELECT queries — block INSERT/UPDATE/DELETE/DROP
- Connection strings stored in `~/.glitool/connections.json`, never in LLM context
- LLM gets schema info, not raw credentials

### 3.3 MongoDB Connector

**New tool: `CLI/src/tools/queryMongoTool.ts`**
- Schema: `{ collection: string, filter: object, limit: number }`
- Read-only mode by default
- Connection managed same as SQL above

### 3.4 RAG Index Management

**New command: `giltol rag`**
- `giltol rag index <path>` — index a folder of documents into Chroma
- `giltol rag add-db <connection-string>` — save a database connection
- `giltol rag list` — show all indexed sources

---

## Phase 5 — Broken Project Rescue & Freelance Mode (Weeks 17–20)

**Goal:** High-value features that make glitool useful beyond just "write new code."

### 5.1 Broken Project Rescue Mode

**New command: `giltol rescue`**

For developers who inherit messy or broken codebases:
1. Scan the entire repo
2. Find architectural issues, dead code, circular dependencies
3. Identify bugs and security vulnerabilities
4. Generate a prioritized repair roadmap
5. Optionally fix issues one by one with user approval

**Files:**
- `CLI/src/tools/rescueTool.ts` — orchestrates the scan
- Uses `analyzeProject`, `searchCode`, `listFiles` tools internally

### 5.2 Freelance / Client Delivery Mode

**New command: `giltol deliver`**

For solo developers and agencies delivering projects to clients:
- Estimate effort for a task before starting
- Generate client-ready summary of what was built
- Create changelogs from git history
- Produce deployment notes
- Generate handoff documentation

**Files:**
- `CLI/src/tools/deliveryTool.ts`
- Uses git integration from Phase 4 + LLM summarization

---

## Phase 6 — Production Hardening (Weeks 21–24)

**Goal:** Tests, Docker, monitoring, pricing tiers — ready for real users and office deployments.

### 4.1 Test Suite

**New: `CLI/src/tests/`**
- Unit tests with **Jest + tsx**:
  - `readProject.test.ts` — verify `.env` not included, path limits work
  - `writeFile.test.ts` — verify path traversal blocked, file written correctly
  - `agent.test.ts` — mock LLM, verify tool call loop, error recovery
- Integration test: full conversation with mock Ollama responses
- Run with: `npm test`

### 4.2 Docker Compose for On-Premise

**New: `docker-compose.yml` at project root**
```yaml
services:
  ollama:       # LLM server
  chroma:       # Vector database
  glitool-api:  # Future API server (Phase 5)
```
- Single command to start full stack: `docker compose up`
- Developer installs Docker, runs compose, immediately has Ollama + Chroma running

### 4.3 Logging

**New file: `CLI/src/logger.ts`**
- Use `winston` for structured logging
- Log to `~/.glitool/logs/` — never to stdout (would break CLI UX)
- Log: LLM calls, tool invocations, errors, session start/end
- Useful for debugging and auditing in corporate environments

### 4.4 Git Integration Tool

**New tool: `CLI/src/tools/gitTool.ts`**
- `git status`, `git diff`, `git add`, `git commit` — with user confirmation before commit
- LLM can show diffs before writing — prevents silent overwrites
- Critical for developer trust in the tool

---

## Phase 6 Continued — Pricing Tiers

**India-friendly pricing strategy:**

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Basic coding agent, limited requests/day, `gpt-4o-mini` only |
| **Solo** | ~₹499/mo | Unlimited requests, smart memory, model routing |
| **Pro** | ~₹999/mo | Multi-role agents, rescue mode, freelance mode |
| **Team/Corporate** | Custom | On-premise Ollama, RAG, role-based access, audit logs |

---

## Phase 7 — Web App (Weeks 25–32)

**Goal:** Expand to non-developer roles with a web UI.

- Activate `server/` — Express or Fastify API wrapping the agent logic
- Activate `client/` — Next.js web app with role-based dashboards
- Auth: JWT + local user store (no cloud auth)
- Web UI exposes same tools as CLI, but with visual diff preview and file browser

---

## Dependency Map

```
Phase 1 (CLI stabilization + security)
    └── Phase 1.5 (CLI UX polish)
            └── Phase 2 (smart memory + model routing)
            └── Phase 3 (multi-role agents + trust layer)
                    └── Phase 4 (RAG — corporate features)
                            └── Phase 5 (rescue + freelance modes)
                                    └── Phase 6 (hardening + pricing)
                                            └── Phase 7 (web app)
```

---

## Key Files to Create/Modify

| Action | File |
|---|---|
| Modify | `CLI/src/agent.ts` — Ollama, error handling, role prompt |
| Modify | `CLI/src/tools/readProject.ts` — remove .env, symlink guard |
| Modify | `CLI/src/tools/writeFileTool.ts` — path traversal fix |
| Modify | `CLI/src/tools/index.ts` — export analyzeProject |
| Modify | `CLI/package.json` — rename, fix scripts |
| Create | `CLI/src/memory.ts` — session persistence |
| Create | `CLI/src/config.ts` — user profile management |
| Create | `CLI/src/prompts/roles.ts` — role-based system prompts |
| Create | `CLI/src/rag/documentLoader.ts` — PDF/Word ingestion |
| Create | `CLI/src/tools/searchDocsTool.ts` — Chroma search |
| Create | `CLI/src/tools/queryDatabaseTool.ts` — SQL read-only |
| Create | `CLI/src/tools/queryMongoTool.ts` — MongoDB read-only |
| Create | `CLI/src/tools/gitTool.ts` — git integration |
| Create | `CLI/src/logger.ts` — winston logging |
| Create | `docker-compose.yml` — Ollama + Chroma |
| Create | `CLI/src/tests/` — Jest test suite |

---

## Verification Per Phase

- **Phase 1:** `npm run dev` → `giltol` starts → asks question → LLM responds → `/exit` works
- **Phase 1.5:** `giltol` starts → welcome banner shows → responses stream token by token → `/help` lists commands → tool calls show file path
- **Phase 2:** `giltol config set-role hr` → system prompt changes → LLM tone changes
- **Phase 3:** `giltol rag index ./docs` → indexing completes → ask question about docs → correct answer
- **Phase 4:** `npm test` → all tests pass → `docker compose up` → full stack starts
