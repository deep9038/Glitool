# MEMORY.md — Glitool Memory System Architecture

Companion to [ARCHITECTURE.md](ARCHITECTURE.md), [ROUTING.md](ROUTING.md), and [TOOLS.md](TOOLS.md).

This document defines how Glitool remembers — within a session, across sessions, and across projects. It is the design spec, not the build log. For the step-by-step build plan, see the table at the bottom.

---

## 1. Purpose

Today Glitool is a goldfish. Every `glitool` invocation starts from zero: the agent re-reads the entire project, has no awareness of prior conversations, and forgets every preference the user ever stated. This document defines a layered memory system that fixes that without turning Glitool into a database product.

The design is shaped by what [Aider](https://aider.chat/docs/repomap.html), [Claude Code](https://code.claude.com/docs/en/how-claude-code-works), [Cursor](https://docs.cursor.com), and [GitHub Copilot](https://docs.github.com/en/copilot/concepts/agents/copilot-memory) converged on. We steal the proven parts, skip the heavy ones.

---

## 2. Current state

| Layer | Where it lives | Lifetime | Problem |
|---|---|---|---|
| Conversation | `sessionMessages` array in [CLI/src/agent.ts](CLI/src/agent.ts) | Until `/exit` | Lost on close |
| Project dump | [CLI/src/readProject.ts](CLI/src/readProject.ts) — full file contents | One session | Bloats every prompt, re-reads unchanged files |
| Project rules | [CLAUDE.md](CLAUDE.md) | Forever (in git) | Static, no learning |
| Routing telemetry | `~/.glitool/routing.log.jsonl` | Forever | Write-only |

**Missing**: cross-session continuity, learned facts, smart project summarization, compaction.

---

## 3. Goals & non-goals

**Goals**
- Survive `/exit` — next session continues where the last left off (opt-in).
- Stop dumping every file every session — send signatures, fetch bodies on demand.
- Learn project-specific facts ("this repo uses Vitest, not Jest") without the user re-typing them.
- Keep long sessions cheap via compaction.
- Never store secrets. Never let stale memory mislead the agent.

**Non-goals**
- No vector DB / embeddings. One user, one repo at a time — grep is enough.
- No MemGPT-style paging hierarchy.
- No cross-user / cross-machine sync.
- No automatic memory of every interaction — quality over quantity.

---

## 4. The four-layer architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SYSTEM PROMPT                           │
│  built at session start, refreshed after compaction         │
└──────────┬──────────┬──────────────┬───────────────┬────────┘
           │          │              │               │
   ┌───────▼────┐  ┌──▼────────┐  ┌──▼──────────┐  ┌─▼──────────┐
   │ L1 Repo    │  │ L2 Rules  │  │ L3 Facts    │  │ L4 Session │
   │ Map        │  │ CLAUDE.md │  │ (citations  │  │ History    │
   │ (signatures│  │ + user    │  │  + TTL)     │  │ (rolling   │
   │  only)     │  │  rules    │  │             │  │  + restore)│
   └───────┬────┘  └───────────┘  └──────┬──────┘  └─────┬──────┘
           │                              │              │
   ┌───────▼──────────────────────────────▼──────────────▼──────┐
   │                    COMPACTION ENGINE                       │
   │  triggers when sessionMessages.length > N                  │
   │  summarizes oldest half, re-reads L1+L2 from disk          │
   └────────────────────────────────────────────────────────────┘
```

Four memory layers feed one system prompt. A compaction engine keeps the prompt bounded over long sessions. Each layer has a different lifetime, format, and write policy.

---

## 5. Layer 1 — Repo Map (replaces `readProject.ts`)

**Source of inspiration**: Aider's [repository map](https://aider.chat/docs/repomap.html).

**What it stores**: a token-budgeted summary of the codebase — class names, exported function signatures, top-level types, file tree. Not file bodies.

**Why**: today `readProject.ts` stuffs every file into the system prompt. On a real project that's 50k+ tokens per session, mostly irrelevant. A repo map is ~1k tokens and tells the agent *what exists and where*. File bodies are read on demand via the existing `readFileTool`.

**Format** (in-memory, not persisted):
```
src/
  agent.ts       (chat, runInteractive)
  llm/
    router.ts    (route, detectDomain, scoreComplexity)
    telemetry.ts (logRouting)
  agents/
    graph.ts     (runAgentGraph)
    planner.ts   (runPlanner)
    coder.ts     (runCoder)
    reviewer.ts  (runReviewer)
```

**Build policy**: regenerated at session start by walking the project with the same path filters readProject already uses. Optional cache at `.glitool/repomap.cache.json` keyed on file mtimes, invalidated when any source file changes.

**Token budget**: hard cap at 1500 tokens. If the repo is bigger, prioritize files near the user's likely topic (cheap heuristic: TypeScript files in `src/`, then docs, then config).

---

## 6. Layer 2 — Project & user rules (CLAUDE.md)

**Source of inspiration**: Claude Code's CLAUDE.md, Cursor's `.cursor/rules/`.

**What it stores**: static, human-written rules. Coding conventions, gotchas, the "always do X" / "never do Y" list.

**Two scopes**:
- `./CLAUDE.md` — project-scoped, checked into git. **Already exists today.**
- `~/.glitool/USER.md` — user-scoped, applies to every project. **New.** For things like "I prefer tabs" or "always run tests after edits".

**Read policy**: loaded fresh at session start AND re-loaded after every compaction event (so rules never decay into a summary).

**Write policy**: humans only. The agent does not edit these files. If the agent learns something, it goes to Layer 3 instead — facts are the agent's territory, rules are the user's.

**Why split from Layer 3**: rules are intentional and durable. Facts are inferred and may be wrong. Mixing them means a bad inference corrupts the user's hand-written rulebook.

---

## 7. Layer 3 — Learned facts (with citations + TTL)

**Source of inspiration**: [GitHub Copilot's memory system](https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/).

**What it stores**: small, atomic facts the agent infers during work. Each fact has a citation pointing at the code/decision that justifies it, and a TTL so it auto-expires.

**File**: `~/.glitool/facts.jsonl` (one fact per line).

**Schema**:
```json
{
  "id": "f_2026-05-13_001",
  "fact": "This project uses ESM — all local imports require .js extension even for .ts files",
  "citation": {
    "type": "file",
    "path": "CLI/package.json",
    "line": null,
    "snippet": "\"type\": \"module\""
  },
  "source": "save_fact_tool",
  "created_at": "2026-05-13T10:22:00Z",
  "expires_at": "2026-06-10T10:22:00Z",
  "confirmed_count": 3
}
```

**Citation types**:
- `file` — points at a file path (and optionally line + snippet)
- `commit` — references a git SHA + message
- `user` — the user said it explicitly via `/remember` (no code citation needed, but TTL still applies)

**Validation on load**: before injecting a fact into the system prompt, the loader checks the citation still exists. If the cited file is gone, or the snippet no longer matches, the fact is **silently dropped and marked invalid**. This is the staleness fix Copilot pioneered.

**TTL**: 28 days default. Every time a fact is reconfirmed (re-derived from the same citation), `expires_at` is pushed forward and `confirmed_count` increments. Facts that survive 5+ confirmations get a longer TTL (90 days) — they've proven durable.

**Budget**: max 50 active facts. When full, evict the lowest `confirmed_count`, then oldest.

**Write policy**: the agent uses a `save_fact` tool (Layer 3 is the only writable agent memory). The user can write directly via a `/remember` slash command.

---

## 8. Layer 4 — Session history

**Source of inspiration**: Aider's `.aider.chat.history.md` + `--restore-chat-history`.

**Two tiers**:

### 4a. Active session (in-memory)
The existing `sessionMessages` array in [CLI/src/agent.ts](CLI/src/agent.ts). No change to where it lives — change to what happens to it.

### 4b. Persisted sessions (on disk)
On `/exit` or clean shutdown, the array is appended to `~/.glitool/sessions/{YYYY-MM-DD}.jsonl`, one session per line, each with:
```json
{
  "session_id": "s_2026-05-13_142233",
  "started_at": "2026-05-13T14:22:33Z",
  "ended_at": "2026-05-13T14:48:01Z",
  "cwd": "/home/influxiq/Desktop/PersonalProject/Glitool",
  "messages": [ /* full sessionMessages array */ ],
  "summary": "User refactored router.ts to add slash commands. 3 files edited.",
  "outcome": "completed"
}
```

**Restore flag**: `glitool --restore` loads the most recent session whose `cwd` matches the current directory, injects its `summary` (not the full messages — too noisy) into the system prompt as "Last session: ...", and you continue.

**Retention**: 30 days on disk, then gzip-archived to `~/.glitool/sessions/archive/`. No deletion — disk is cheap and session logs are debugging gold when routing or planning misbehaves.

---

## 9. Compaction

**Source of inspiration**: Claude Code's `/compact`.

**Trigger**: when `sessionMessages.length > 30` OR estimated token count > 60% of model limit.

**Algorithm**:
1. Take the oldest 60% of messages.
2. Send to a cheap model (`gpt-4o-mini`) with a "summarize this conversation, preserve decisions and any unresolved questions" prompt.
3. Replace those messages with a single `SystemMessage` containing the summary.
4. **Critically**: re-read CLAUDE.md and the repo map from disk. The summary is allowed to be lossy about chat; rules and structure must stay sharp.
5. Keep the *first* user message verbatim, always. It's the original intent.

**Idempotency**: each compaction tags its output message with `compacted: true`. Already-compacted blocks are not re-compacted.

---

## 10. File & directory layout

```
~/.glitool/
├── USER.md                         # cross-project user rules (Layer 2)
├── facts.jsonl                     # learned facts (Layer 3)
├── routing.log.jsonl               # existing — router telemetry
├── sessions/
│   ├── 2026-05-13.jsonl            # one line per session (Layer 4b)
│   ├── 2026-05-14.jsonl
│   └── archive/
│       └── 2026-04.jsonl.gz
└── config.json                     # opt-in flags: enableFacts, enableRestore, etc.

<project root>/
├── CLAUDE.md                       # project rules (Layer 2) — existing
└── .glitool/
    └── repomap.cache.json          # mtime-keyed cache (Layer 1)
```

---

## 11. Integration points in code

| Component | Today | After |
|---|---|---|
| [CLI/src/readProject.ts](CLI/src/readProject.ts) | Dumps full file contents | Becomes `buildRepoMap()` — signatures only, token-budgeted |
| [CLI/src/agent.ts](CLI/src/agent.ts) `runInteractive` | Loads project context once | Loads repo map + CLAUDE.md + USER.md + active facts |
| [CLI/src/agent.ts](CLI/src/agent.ts) `chat()` | Just appends to `sessionMessages` | Also checks token threshold, triggers compaction |
| [CLI/src/agent.ts](CLI/src/agent.ts) on `/exit` | Process ends | Persists session to disk |
| [CLI/src/agents/coder.ts](CLI/src/agents/coder.ts) tools list | listFiles, readFile, searchCode, editFile, writeFile | + `save_fact` |
| New: [CLI/src/memory/repoMap.ts](CLI/src/memory/repoMap.ts) | — | Walks project, extracts signatures |
| New: [CLI/src/memory/facts.ts](CLI/src/memory/facts.ts) | — | Load/save/validate/evict facts |
| New: [CLI/src/memory/session.ts](CLI/src/memory/session.ts) | — | Persist/restore sessions |
| New: [CLI/src/memory/compact.ts](CLI/src/memory/compact.ts) | — | Compaction engine |

All new code lives under `CLI/src/memory/` so it's a clean module, not scattered.

---

## 12. Lifecycle: a session, end to end

```
glitool [--restore]
   │
   ├── build system prompt:
   │     L1 repo map      ← CLI/src/memory/repoMap.ts
   │     L2 rules         ← CLAUDE.md + ~/.glitool/USER.md
   │     L3 facts (valid) ← ~/.glitool/facts.jsonl, citations checked
   │     L4 last summary  ← if --restore, from ~/.glitool/sessions/
   │
   ├── user types → sessionMessages.push(HumanMessage)
   │     │
   │     ├── route() decides path (see ROUTING.md)
   │     ├── agent runs, may call save_fact during coding
   │     ├── response appended to sessionMessages
   │     │
   │     └── if sessionMessages.length > 30:
   │            compact() ← summarize oldest 60%, re-read L1+L2
   │
   └── /exit:
         persist sessionMessages → ~/.glitool/sessions/{date}.jsonl
```

---

## 13. Backfire risks (and mitigations)

| Risk | Where it bites | Mitigation |
|---|---|---|
| Stale fact misleads agent | Layer 3 | Citation validation on every load |
| Facts file fills with noise | Layer 3 | 50-fact cap, TTL, eviction by confirmed_count |
| Secret accidentally saved | Layer 3 | Pre-write regex scan for API key / token patterns; refuse if matched |
| Two terminals corrupt the JSONL | Layer 3, 4 | Append-only writes with `proper-lockfile` |
| Compaction loses load-bearing detail | Compaction | Always preserve first user message verbatim |
| Repo map skips the file the user needs | Layer 1 | File bodies still fetchable via existing `readFileTool` — map is hint, not gate |
| Restore loads wrong session (wrong project) | Layer 4 | Match on `cwd` exactly; warn if no match |
| Session JSONL grows unbounded | Layer 4 | 30-day rotation to gzipped archive |
| User runs `glitool` in `~/` and dumps every file | Layer 1 | Hard cap on file count (200) before bailing out |

---

## 14. What we explicitly are NOT building

These are seductive but wrong-shaped for Glitool today:

- **Vector / embedding memory** — needs an embedding model, latency on every turn, retrieves by similarity which is often wrong. One user, one repo: grep wins.
- **MemGPT-style hierarchy with paging** — the context window we have is already plenty for a CLI tool's sessions.
- **Cross-machine sync** — no cloud, no auth, no problem. If the user wants this they can put `~/.glitool/` in a dotfiles repo.
- **Automatic memory of every interaction** — Copilot tried this; the facts store became a junk drawer. Better: agent saves only when it has a citation.
- **Procedural memory / playbooks** — interesting but overlap with CLAUDE.md. Revisit if CLAUDE.md gets too crowded.
- **Cursor's split rule files (`.mdc`)** — only useful when rules grow past ~500 lines. We're nowhere near that.

---

## 15. Build order

Same effort estimates as the recommendation. Each step is independently shippable.

| # | Step | File(s) touched | Effort | Verification |
|---|---|---|---|---|
| 1 | **Repo map** replaces full-file dump | `readProject.ts` → new `memory/repoMap.ts`, `agent.ts` startup | 2 hr | Token count of system message drops by >80%, agent still finds files via `readFileTool` |
| 2 | **Session persistence + `--restore`** | new `memory/session.ts`, `agent.ts` exit hook, `index.ts` flag | 30 min | Run, exit, run with `--restore`, see prior summary in prompt |
| 3 | **Compaction** | new `memory/compact.ts`, `agent.ts` `chat()` | 1 hr | Force 35+ messages, observe summarization, verify CLAUDE.md re-loaded |
| 4 | **Facts file with citations + TTL** | new `memory/facts.ts`, `agent.ts` startup | 1.5 hr | Hand-write a fact, see it loaded; mutate the cited file, see it dropped |
| 5 | **`save_fact` tool** | new `tools/saveFact.ts`, register in `agents/coder.ts` | 1 hr | Run a session where agent saves a fact; verify it persists and loads next session |
| 6 | **`/remember` slash command** | `agent.ts` input parser, `memory/facts.ts` | 30 min | `/remember this project uses Vitest` saves a fact with `source: user` |
| 7 | **Observe & tune** | — | 1 week | Read facts.jsonl, prune nonsense, adjust TTL / cap / save prompt |

Total active work: ~6.5 hours. Observation week is wall-clock, not effort.

---

## 16. What this unlocks

Once Layers 1–4 land, ARCHITECTURE.md's later stages become much easier:

- **Smarter planner** — planner sees only signatures, plans against them, fetches bodies on demand.
- **Cheaper reviewer** — review against summaries of prior similar work, not blind.
- **Cross-session routing** — `routing.log.jsonl` + session history together let us actually evaluate routing decisions (did the user follow up unhappily?).
- **The "skip what didn't change" optimization** — repo map cache by mtime means cold start is near-instant on unchanged projects.

---

## 17. Cheat sheet

| You want to... | Edit |
|---|---|
| Add a project rule | `./CLAUDE.md` |
| Add a personal rule across projects | `~/.glitool/USER.md` |
| Teach Glitool a fact mid-conversation | type `/remember <fact>` |
| Continue your last session | `glitool --restore` |
| Wipe learned facts | `rm ~/.glitool/facts.jsonl` |
| Debug what went wrong yesterday | `cat ~/.glitool/sessions/2026-05-12.jsonl | jq` |
| See what the agent knows right now | `cat ~/.glitool/facts.jsonl` |

---

**Status**: design only. Nothing built yet. Begin at Step 1 (repo map) when ready.
