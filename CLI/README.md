# glitool

AI coding assistant for your terminal. Multi-agent pipeline, smart routing,
and a live process trace — all without leaving your terminal.

## Install

```bash
npm install -g glitool
```

## Setup

```bash
mkdir -p ~/.glitool
echo "OPENAI_API_KEY=sk-..." > ~/.glitool/.env
```

Then start:

```bash
glitool
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/plan` | Create a structured plan for a complex task |
| `/coder` | Run the full multi-agent coding pipeline |
| `/debug` | Diagnose errors and broken behavior |
| `/refactor` | Restructure code without changing behavior |
| `/review` | Audit code for bugs, security, and quality |
| `/git` | Commit, push, diff, branch — full git operations |
| `/explain` | Explain a concept or file (no file edits) |
| `/quick` | Fast chat, cheapest model, no pipeline |
| `/model` | Show or switch the active model |
| `/memory` | View project memory and session summary |
| `/tools` | List available tools |
| `/clear` | Clear session (keeps memory) |
| `/reset` | Clear session and wipe memory |
| `/exit` | Save summary and quit |

## Smart Routing

You don't need slash commands. Glitool reads your message and picks the
right agent automatically:

```
why is my server crashing?       → DEBUGGER
review src/auth.ts               → REVIEWER
refactor the parser module       → REFACTORER
commit my changes                → GIT AGENT
how does useEffect work?         → EXPLAINER
add a rate limiter               → CODER (full pipeline)
```

## Multi-Agent Pipeline

For coding tasks, four agents run in sequence:

```
PLANNER → CODER → VALIDATOR → JUDGE
```

- **PLANNER** reads your request and produces a numbered step-by-step plan
- **CODER** executes the plan using file and shell tools
- **VALIDATOR** runs TypeScript and ESLint checks on the result
- **JUDGE** reviews the output and decides if it meets the requirement

Each stage is shown live in the terminal as it runs — with reasoning text
and every tool call displayed in order.

## Tools

Agents have access to:

| Tool | What it does |
|------|-------------|
| `readFile` | Read any file in the project |
| `listFiles` | List files matching a glob pattern |
| `searchCode` | Search source files for a string or pattern |
| `writeFile` | Create a new file |
| `editFile` | Edit an existing file |
| `bash` | Run shell commands (risk-gated) |
| `webFetch` | Fetch a URL and read its content |

Dangerous shell commands (`rm -rf /`, `sudo`, `curl \| sh`) are blocked.
Sensitive commands (`git push`, `npm publish`) require your confirmation.

## Memory

Glitool remembers context across sessions:

- **Session memory** — last 40 messages saved per project, auto-summarized
- **Project memory** — tech stack, architecture decisions, and TODOs
  extracted from your conversations, stored in `.glitool/memory.json`

## Configuration

Config file: `~/.glitool/config.json`

```json
{
  "name": "Developer",
  "preferredLanguage": "TypeScript",
  "codingStyle": "spaces",
  "preferredModel": "gpt-4o-mini"
}
```

## Requirements

- Node.js 18 or higher
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
