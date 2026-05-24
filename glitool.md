# Glitool

An AI coding assistant that lives in your terminal. Talk to it in plain English — it reads your code, writes files, runs commands, and shows you exactly what it's doing as it works.

---

## Installation

```bash
npm install -g glitool
glitool
```

That's it. First run gives you **5 free anonymous requests** with no sign-in.

To unlock 50 requests/month free, type `/signup` inside the CLI and link your GitHub account. One click, no email needed.

### Power users — bring your own key

If you'd rather use your own OpenAI API key and skip the managed backend:

```bash
export OPENAI_API_KEY=sk-...
glitool
```

(or persist it in `~/.glitool/.env` if you prefer)

---

## How It Works

Type a message and press Enter. Glitool decides what kind of task you're describing, picks the right agent and model, then works through the task step by step. While it works you can see a live trace showing which stage is running, what reasoning it used, and which files or commands it touched — before the final answer appears.

---

## Slash Commands

Type `/` to open the command palette. Use arrow keys to navigate, Enter to run, Esc to dismiss.

| Command    | What it does |
|------------|--------------|
| `/help`    | Show all commands and keyboard shortcuts |
| `/plan`    | Force planning mode — get a structured plan for a complex task |
| `/coder`   | Force coding mode — runs the full multi-agent pipeline |
| `/debug`   | Force debug mode — diagnoses errors, tracebacks, and broken behavior |
| `/refactor`| Force refactor mode — restructures code without changing behavior |
| `/review`  | Force review mode — audits code for bugs, security, and quality |
| `/git`     | Force git mode — commits, diffs, branches, pushes |
| `/explain` | Explanation only — no file edits, just answers |
| `/quick`   | Quick chat — fastest model, no pipeline, simple Q&A |
| `/model`   | Show or switch the active model |
| `/memory`  | View or edit project memory and session summary |
| `/tools`   | List enabled tools and their permissions |
| `/clear`   | Clear the current chat session (keeps memory) |
| `/reset`   | Clear chat and wipe all memory and summaries |
| `/exit`    | Save session summary and quit |

---

## Domain Agents

Each domain is handled by a specialized agent with its own system prompt and toolset.

### CODER (`/coder`)
The full multi-agent pipeline for writing and editing code. Four stages run in sequence:

```
PLANNER → CODER → VALIDATOR → JUDGE
```

- **PLANNER** reads your request and produces a numbered step-by-step plan
- **CODER** executes the plan, calling tools to read, write, and search files
- **VALIDATOR** runs TypeScript compilation and ESLint checks on the result
- **JUDGE** reviews the output and decides whether it meets the original requirement

The pipeline is shown live in the terminal as it runs. Each stage displays its reasoning and every tool call it makes.

Example prompts:
```
Add a retry mechanism to the fetch utility in src/api.ts
Build a rate limiter middleware for the Express server
Add dark mode toggle to the settings page
```

### DEBUGGER (`/debug`)
Diagnoses errors, exceptions, and broken behavior. Reads relevant files, traces the error, and proposes a fix.

Example prompts:
```
/debug TypeError: Cannot read properties of undefined at line 42
/debug My server crashes on startup with EADDRINUSE
/debug Why does the login form submit but nothing happens?
```

### REFACTORER (`/refactor`)
Restructures existing code without changing its behavior. Extracts functions, renames variables, reduces duplication, and improves readability.

Example prompts:
```
/refactor src/utils/parser.ts is getting too long, split it up
/refactor Extract the validation logic from UserForm into a separate hook
/refactor Rename all instances of "usr" to "user" in the auth module
```

### REVIEWER (`/review`)
Audits code for bugs, security issues, performance problems, and style. Returns a structured report with severity levels (CRITICAL, WARNING, SUGGESTION).

Example prompts:
```
/review src/auth/jwt.ts
/review Check the SQL queries in src/db for injection vulnerabilities
/review Is this API handler safe to deploy?
```

### GIT AGENT (`/git`)
Handles git operations: staging, committing, diffing, branching, and pushing.

Example prompts:
```
/git commit everything with a good message
/git what changed since last commit?
/git create a new branch called feature/dark-mode
/git push to origin main
```

### PLANNER (`/plan`)
Produces a detailed architecture plan or implementation roadmap without writing any code. Useful for designing a system before building it.

Example prompts:
```
/plan How should I structure authentication in a Next.js + Postgres app?
/plan Design a job queue system for processing image uploads
/plan What's the best approach for real-time notifications?
```

### EXPLAINER (`/explain`)
Answers questions about code, concepts, and documentation. Never edits files. Uses the cheapest model for fast answers.

Example prompts:
```
/explain How does useEffect cleanup work in React?
/explain What does the ?? operator do in TypeScript?
/explain read src/agent.ts
```

### QUICK (`/quick`)
Plain chat with the fastest model. No pipeline, no tool calls. Use for simple questions.

Example prompts:
```
/quick What's the difference between null and undefined?
/quick Give me a regex for matching email addresses
/quick How do I convert a string to a number in TypeScript?
```

---

## Auto-Routing

You don't need to use slash commands. Glitool reads your message and picks the right agent automatically.

| What you type | What it detects |
|--------------|-----------------|
| "fix the crash in api.ts" | debugging |
| "refactor the auth module" | refactoring |
| "review my SQL queries" | review |
| "commit my changes" | git |
| "how does X work?" | explanation |
| "implement a rate limiter" | coding |
| "plan the architecture for..." | planning |
| "hi", "thanks", "ok" | quick chat |

The router checks patterns first. For ambiguous messages it escalates to a small LLM classifier. You can see which path was taken in the routing log.

---

## Tools the AI Can Use

When working on a task, agents have access to these tools:

| Tool | What it does |
|------|-------------|
| `readFile` | Read any file in the project |
| `listFiles` | List files matching a glob pattern |
| `searchCode` | Search source files for a string or pattern |
| `writeFile` | Create a new file |
| `editFile` | Edit an existing file (targeted replacement) |
| `bash` | Run a shell command |
| `webFetch` | Fetch a URL and read its content |
| `read_background_output` | Read output from a background process |

The tool name and target file or command are shown in the live trace as each one is called.

---

## Safety System

Glitool has a three-tier risk system that governs what tools can do without asking.

### File writes
- Writing to `.env` files or `.git/` is **blocked** entirely
- All other writes require a confirmation prompt before proceeding

### Shell commands
Blocked outright (never run):
- `rm -rf /` or `rm -rf ~`
- `sudo` commands
- Piped shell execution (`curl | sh`)
- Fork bombs
- Disk formatting (`dd`, `mkfs`)

Require your confirmation before running:
- `git push`, `git reset --hard`, `git rebase`
- `npm publish`, `npm install`, `npm uninstall`
- `docker rm`, `docker exec`

Everything else runs immediately.

If you cancel a confirmation prompt, the agent stops and does not retry.

---

## Memory System

Glitool remembers context across sessions so you don't have to repeat yourself.

### Session memory
- Your last 40 messages are saved per project (identified by folder path)
- On startup, previous context is loaded so the AI knows what you were working on
- Sessions longer than 4 messages are automatically summarized to stay concise

### Project memory
Stored in `.glitool/memory.json` in your project folder. Contains:
- **Tech stack** — languages, frameworks, and libraries detected from conversation
- **Architecture decisions** — structural choices mentioned during sessions
- **TODOs** — next steps or tasks mentioned but not completed

View or edit memory with `/memory`. Wipe everything with `/reset`.

---

## Live Pipeline Trace

When a task runs through the multi-agent pipeline or a domain agent, you see a live trace in the terminal:

```
◑ PLANNER
  1. Read the existing fetch utility
  2. Add retry logic with exponential backoff
  3. Export the updated function

● CODER
  ✓ readFile  src/api/fetch.ts
  ✓ writeFile src/api/fetch.ts

● VALIDATOR
  No errors found.

● JUDGE
  Implementation matches the requirement. Retry logic added correctly.
```

Spinning bullets (`◐◓◑◒`) show which stage is currently active. Filled bullets (`●`) show completed stages. The trace is preserved in the chat history above each response.

---

## Configuration

Config file: `~/.glitool/config.json`

```json
{
  "name": "Developer",
  "preferredLanguage": "TypeScript",
  "codingStyle": "spaces",
  "preferredModel": "gpt-4o-mini",
  "routing": {
    "useLlmClassifier": true
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | Your name, shown in the welcome screen |
| `preferredLanguage` | Language hint for the AI |
| `codingStyle` | `"tabs"` or `"spaces"` |
| `preferredModel` | Model used for quick/explain tier (advisory — server picks based on plan) |
| `routing.useLlmClassifier` | Whether to use LLM for ambiguous routing decisions |

### Account tiers

| Plan | Price | Requests | Sign-in |
|------|-------|----------|---------|
| Anonymous | Free | 5 lifetime | None |
| Free | Free | 50 / month | GitHub (one click via `/signup`) |
| Pro | $12 / month | Unlimited | GitHub |

### Models served per tier (Together.ai serverless)

The server picks the model based on your plan + the domain of your prompt:

| Plan | Domain | Model |
|------|--------|-------|
| Anonymous | Any | meta-llama/Llama-3.3-70B-Instruct-Turbo |
| Free | Chat / explain / git / plan / review | meta-llama/Llama-3.3-70B-Instruct-Turbo |
| Free | Coding / debug / refactor | openai/gpt-oss-20b |
| Pro | Chat / explain / git | meta-llama/Llama-3.3-70B-Instruct-Turbo |
| Pro | Coding / debug / refactor | openai/gpt-oss-20b |
| Pro | Plan / review | openai/gpt-oss-120b |

(Classifier always uses Qwen/Qwen2.5-7B-Instruct-Turbo, internally — doesn't count against your quota.)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `/` | Open command palette |
| `↑` / `↓` | Navigate command palette |
| `Esc` | Dismiss command palette |
| `Ctrl+C` | Quit (saves session) |

---

## Example Session

```
> /review src/auth/login.ts
◑ REVIEWER
  ✓ readFile  src/auth/login.ts
  ✓ searchCode password

CRITICAL: Password comparison uses == instead of bcrypt.compare — timing attack risk
WARNING:  JWT secret falls back to hardcoded string when env var is missing
SUGGESTION: Add rate limiting to the login endpoint

> fix the CRITICAL issue
◑ CODER
  ✓ readFile   src/auth/login.ts
  ✓ writeFile  src/auth/login.ts

Replaced == comparison with bcrypt.compare. The timing-safe comparison is now in place.

> /git commit this fix
◑ GIT
  ✓ bash  git add src/auth/login.ts
  ✓ bash  git commit -m "fix: use bcrypt.compare for timing-safe password check"

Committed. 1 file changed.
```

---

## Data and Privacy

- API calls go to OpenAI. Your code is sent as context with each request.
- Session files and memory are stored locally in `~/.glitool/` and `.glitool/` in your project.
- No telemetry or data collection beyond what OpenAI logs.

---

## Requirements

- Node.js 18 or higher
- An OpenAI API key
- A terminal with Unicode support (for the pipeline trace UI)
