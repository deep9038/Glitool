# Claude Code vs Glitool — Architecture Comparison

Simple language comparison of both systems.

---

## Claude Code Architecture

Think of it as **one smart agent with a huge toolbox.**

```
You type a message
        ↓
Single agent receives it
        ↓
Agent decides what tools to use
        ↓
Calls tools (read, write, bash, search, LSP, MCP...)
        ↓
Loops until done
        ↓
Responds
```

**Key characteristics:**

- **One agent, one loop.** No routing, no "which agent should handle this." The same agent handles debugging, coding, git, refactoring — everything.
- **Tool-first thinking.** The agent figures out what to do by using tools, not by being pre-programmed with domain logic.
- **Extensible by design.** Plugins add tools. MCP servers add tools. Hooks intercept tools. Everything is a tool.
- **Deep IDE integration.** LSP gives it live error diagnostics. CLAUDE.md gives it project instructions. Git state is always visible.
- **Permission system gates everything.** Every tool has a declared permission level. The user controls what's allowed session-wide.
- **Runs anywhere.** Local, remote SSH, inside Docker, in CI — same agent, different runtime modes.

---

## Glitool Architecture

Think of it as **a router that sends messages to specialist agents.**

```
You type a message
        ↓
Router classifies it (debugging? coding? git? chat?)
        ↓
Clarifier searches codebase, maybe asks questions
        ↓
Specialist agent runs (debugger / coder / planner / etc.)
        ↓
Agent uses its specific tools
        ↓
Responds
```

**Key characteristics:**

- **Domain routing.** Every message is classified into 1 of 8 domains before anything runs. Different domain = different agent = different system prompt + tools.
- **Multi-agent pipeline for coding.** Coding tasks go through: Planner → Coder → Reviewer. Three separate LLM calls with specialized prompts.
- **Pre-execution clarifier.** Before the agent runs, Glitool searches the codebase and optionally asks the user clarifying questions.
- **Your own backend.** Requests go through `api.glit.in` → Together.ai, not directly to Anthropic. You control the models, the limits, the tiers.
- **Session + project memory.** Conversation history persists. Project facts can be saved. Summary generated when session gets long.
- **Monitor.** Real-time SSE dashboard showing every tool call, LLM message, and system prompt as it happens.

---

## Side-by-Side Comparison

| | Claude Code | Glitool |
|---|---|---|
| **Agent structure** | One universal agent | 6+ specialist agents |
| **Routing** | None — agent decides | Router classifies first |
| **Tools** | One shared toolset for all tasks | Each agent has its own tool subset |
| **Coding workflow** | Agent figures it out | Planner → Coder → Reviewer pipeline |
| **Context awareness** | LSP + git + CLAUDE.md auto-injected | Clarifier searches codebase on demand |
| **Extensibility** | Plugins + MCP servers | Hardcoded tools only (for now) |
| **Permission model** | 5 tiers, per-tool declared | Heuristic risk scorer |
| **Backend** | Direct to Anthropic API | Your server → Together.ai |
| **Auth** | Anthropic account | Anonymous / GitHub / BYOK |
| **Memory** | Session compaction + CLAUDE.md | Session JSON + project memory file |
| **Monitoring** | None public-facing | Full SSE monitor dashboard |
| **Runs remotely** | SSH / Docker / CI modes | Local terminal only |

---

## The Core Philosophical Difference

**Claude Code:** *"One powerful agent with unlimited tools. Give it everything and let it figure out the approach."*

**Glitool:** *"Route to the right specialist. Each agent knows its job deeply. Control the workflow explicitly."*

---

## What Each Approach Gets Right

**Claude Code's strength:**
Simpler to reason about. No routing mistakes. Agent can cross domains naturally — a debugging task that becomes a coding task mid-way just continues without re-routing. Tool-based extensibility means you can add capabilities without touching agent logic.

**Glitool's strength:**
Specialist prompts make each domain much sharper. The debugger has a strict REPRODUCE → DIAGNOSE → PATCH workflow that a general agent wouldn't enforce. The planner gives the coder a structured plan before it touches any file. The clarifier saves wasted tool calls by understanding the codebase first. The monitor gives full visibility into what's happening.

---

## What Glitool Is Missing from Claude Code

1. **Cross-domain tasks** — if a debugging task requires writing new code, Glitool routes to the debugger which can't create files. Claude Code just does both.
2. **Auto-context** — Claude Code always knows git state and CLAUDE.md before the first tool call. Glitool agents start blind.
3. **Extensibility** — can't add tools without modifying source code. No plugin system, no MCP.

## What Claude Code Is Missing from Glitool

1. **Pre-execution codebase awareness** — Glitool's clarifier searches the project before the agent runs. Claude Code's agent discovers the codebase through tool calls.
2. **Structured coding pipeline** — no equivalent of Planner → Coder → Reviewer separation.
3. **Your own backend** — you can't control models, pricing, or add tiers with the official Claude Code.
4. **Monitor** — no equivalent real-time trace dashboard.

---

*Source: Analysis of Claude Code internal architecture (claw-code-main) vs Glitool codebase.
Date: 2026-05-28*
