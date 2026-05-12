# glitool CLI — UI Redesign Plan

> **Direction:** Warm-paper, IDE-density terminal UI built on Ink.
> **Goal:** Replace the current single-input chat surface with six structured screens that surface the agents, tools, diffs, and cost.
> **Approach:** Rebuild `App.tsx` from scratch — old version archived for reference.

---

## 1. Decisions locked in

| Question | Decision |
|---|---|
| Status bar position | **Always visible at the bottom** (sticky last-row) |
| Diff rendering | **Inline unified** (`+` / `-` prefix, single column) — works on any terminal width |
| Background color | **Use only the user's terminal background** — no forced paper background |
| Migration strategy | **Rebuild from scratch** — archive old `App.tsx`, write new |
| First build target | **Tokens + Welcome** — foundation everything else reuses |

---

## 2. v1 scope (in order)

1. Welcome screen + status bar + slash palette
2. Tool log + agent pipeline cards
3. Confirm card with inline diff
4. Explain side-rail card

Out of scope for v1: `/test` runner, mascot ("glit") — those are v2 ideas.

---

## 3. Color & type system

### Palette (OKLCH source → ANSI/chalk hex target)

| Token | Hex (closest) | Used for |
|---|---|---|
| `paper` | `#faf7f2` | (NOT painted — user terminal bg shows through) |
| `ink` | `#1f1b16` | Primary text — user prompts, headings |
| `ink2` | `#3b3429` | Body text |
| `muted` | `#8a8170` | Labels, supporting text |
| `muted2` | `#b3a994` | Hints, file paths, dim |
| `line` | `#e6ddc9` | Borders, separators |
| `amber` | `#c4732e` | Primary action · coder agent · current input border |
| `sage` | `#5a8c5a` | Success · `+` diff |
| `rust` | `#b54226` | Error · `-` diff |
| `mustard` | `#c69a3a` | Warn · confirm prompt |
| `violet` | `#6c5ab8` | Planner agent |
| `teal` | `#3e8a9a` | Reviewer agent |

> Note: Warm cream "paper" backgrounds in the HTML mockup are NOT painted in the terminal. We use the user's existing background and color the text only. Box borders use `line` color. Boxes look "soft" via border tone, not via fill.

### Type
- All text is mono (terminal default).
- Role tags (`you`, `glitool`, `tools`, `graph`, `plan`, `note`) are rendered in **small caps** with `muted` color. Inter-style — but in the terminal we just lowercase + space-letter manually.

### Glyphs / symbols

| Symbol | Meaning |
|---|---|
| `›` | User input prefix |
| `?` | Confirm input prefix |
| `✓` | Tool/agent done |
| `●` | Tool/agent running |
| `◌` | Tool/agent queued/idle |
| `→` | Tool target separator |
| `■` | Status bar dot |
| `+` / `-` | Diff add/remove |
| `!` | Confirm warning lock icon |

---

## 4. Six screens — what each one shows

### 4.1 Welcome (first launch / boot)

```
g  Welcome back, Magnes.
   AI coding assistant · session resumed · 4 prior turns summarized           v1.0.1

┌─ Workspace · indexed ────────────────────────────────────────┐
│ path     ~/Desktop/personal/glitool                          │
│ branch   main · clean                                        │
│ files    42 · 8.1k LOC · ts/tsx                              │
└──────────────────────────────────────────────────────────────┘
┌─ Runtime ────────────────────────────────────────────────────┐
│ model    gpt-4o-mini    [router on]                          │
│ tools    7 enabled                                           │
│ explain  off · pass -e to enable                             │
└──────────────────────────────────────────────────────────────┘

  /help     List commands and shortcuts
  /model    Show or switch the active model
  /tools    List available tools
  /clear    Clear current session
  /exit     Save summary and quit

› Ask anything, or type / for commands▏

■ glitool · ~/Desktop/personal/glitool · main          gpt-4o-mini · 0 tokens · idle
```

**Notes:**
- Two side-by-side info boxes in the HTML — in the terminal we stack them vertically (terminals are usually narrower than the mockup).
- The `[router on]` is a small chip — render in `amber` text with brackets.

### 4.2 Slash autocomplete

```
› /m▏

┌─ commands · type to filter · ↑↓ navigate · ⏎ run · esc dismiss ─┐
│ › /model    Show or switch the active model                     │
│   /memory   View or edit project memory and session summary     │
│   /tools    List enabled tools and their permissions            │
│   /clear    Clear current chat (keeps memory)                   │
│   /reset    Clear chat and wipe memory + summary                │
│   /exit     Save summary and quit                               │
└─────────────────────────────────────────────────────────────────┘

■ glitool · ready                                       gpt-4o-mini · 7 matches
```

**Notes:**
- Shows ONLY when input starts with `/`.
- Selected row marked with `›` prefix.
- Selected row: command in `amber`, description in `ink2`.
- Unselected: command in `ink`, description in `muted`.

### 4.3 Tool call log

```
you · 14:08
  where do we resolve the OpenAI key?

tools
  ✓ listFiles    → src/                       42 files · 18ms
  ✓ readFile     → src/agent.ts                 5.1 KB · 12ms
  ✓ readFile     → src/llm/router.ts            2.3 KB ·  9ms
  ● searchCode   → "OPENAI_API_KEY"             running…

glitool · streaming · gpt-4o-mini · 87 tok
  The key is loaded from ~/.glitool/.env at startup
  (src/index.tsx:17) and falls through to process.env…▏

■ ● working · searchCode "OPENAI_API_KEY" · 3/4 steps    gpt-4o-mini · 3.1k tokens · $0.002
```

**Notes:**
- Each tool row: `<state-icon> <tool-name 12ch> → <target> <stat right-aligned>`
- Done rows: `sage` icon, `ink2` name, `muted` stat.
- Running rows: `amber` icon (animated `◌ ● ◔ ◑`), `amber` name.
- `target` colored as inline path chip — `ink` text on subtle bracket.

### 4.4 Multi-agent pipeline

```
graph
  ┌─ Planner ─────────┐  →  ┌─ Coder ───────────┐  →  ┌─ Reviewer ────────┐
  │ P  done · 0.8s    │     │ C  writing · 1/3  │     │ R  queued         │
  │ 3 steps · adds    │     │ editing App.tsx · │     │ will run          │
  │ /memory wiring    │     │ adding /memory    │     │ typecheck + risk  │
  └───────────────────┘     └───────────────────┘     └───────────────────┘

plan
  ① Add /memory case in App.tsx · handleSubmit
  ② Read ~/.glitool/project.json, hash it, spawn $EDITOR on a temp copy
  ③ On save, diff hash — if dirty, route through setConfirmHandler

■ ● graph · planner✓ · coder●1/3 · reviewer◌      complex tier · gpt-4o · 11.7k tokens · $0.018
```

**Notes:**
- Three boxes laid out horizontally with `→` arrows between.
- Each box has a colored single-letter badge: P (violet), C (amber), R (teal).
- Box border tints by state: done = sage, active = amber, queued = muted.
- If terminal is narrow (<100 cols), stack vertically.

### 4.5 Confirm with inline diff

```
graph: planner ✓  coder ✓  reviewer ⏸ (paused — awaiting confirm)

! glitool wants to write 2 files                           risk · medium

┌─ src/ui/App.tsx                                              +24  -3 ─┐
│ 112      if (cmd === '/reset') { … }                                  │
│ 115    + if (cmd === '/memory') {                                     │
│ 116    +   await openMemoryEditor(setConfirmHandler);                 │
│ 117    +   return;                                                    │
│ 118    + }                                                            │
│ 119      if (cmd === '/help') { … }                                   │
└────────────────────────────────────────────────────────────────────────┘
┌─ src/projectMemory.ts                                        +14  -0 ─┐
│ 42       export function loadProjectMemory() { … }                    │
│ 44     + export async function openMemoryEditor(                      │
│ 45     +   confirm: (msg: string) => Promise<boolean>                 │
│ 46     + ) { /* … spawn $EDITOR, hash, confirm */ }                   │
└────────────────────────────────────────────────────────────────────────┘

  Apply both files?                  [d view full diff]  [n reject]  [y approve ⏎]

? y▏

■ ⏸ awaiting confirm · 2 files · +38/-3 · risk medium    gpt-4o · 12.4k tokens · $0.019
```

**Notes:**
- Inline unified diff (no side-by-side).
- Added line: full row in `sage`, `+` prefix.
- Removed line: full row in `rust`, `-` prefix.
- Unchanged context: `ink2`, line number `muted2`.
- File header: `muted` text, `+N -N` stat right-aligned (sage / rust).
- Risk pill: low → mustard, medium → mustard, high → rust.
- Action row keys: `d`, `n`, `y` colored `amber` with bracket.

### 4.6 Explain side-rail

```
you · 14:33
  why is the reviewer running before the test step?

glitool · gpt-4o-mini · 142 tok · 1.1s
  In src/agents/graph.ts the edges are planner → coder → reviewer → tests.
  The reviewer is a static gate (typecheck + risk score) that's cheap, so
  it runs first to fail fast before we spend tokens on the test agent.

  ┌ // graph.ts ─────────────────────────────────┐
  │ graph.addEdge("coder", "tests");             │
  │ graph.addEdge("tests", "reviewer");          │
  └───────────────────────────────────────────────┘

│ 💡 EXPLAIN
│ Think of it like a security desk before the lab. The reviewer is the
│ desk — quick check, low cost. The tests step is the lab — slow and
│ expensive. We do the cheap check first so we don't pay for tests on
│ code that was going to be rejected anyway.
│
│ to switch: /explain off · or set explainMode: false in config.json

  [copy answer]  [save to memory]  [ask follow-up]

■ ready · explain on                       simple tier · gpt-4o-mini · 14.0k tokens · $0.022
```

**Notes:**
- Explain block has a single left border bar (no full box) — `amber` color.
- Body text in `ink2`, lighter than the main response.

### 4.7 Status bar (always visible, every screen)

Format:
```
■ <state-dot> <state-text> · <details>           <tier> · <model> · <tokens> · <cost>
```

States and dot colors:
- `idle` → muted dot, "idle"
- `ready` → sage dot, "ready"
- `working` → amber dot (animated), "working · <current step>"
- `awaiting confirm` → mustard dot, "awaiting confirm · <files>"
- `error` → rust dot, "error · <message>"

Right side always shows: tier, model, token count, cumulative cost. Format compact: `gpt-4o-mini · 3.1k tokens · $0.002`.

---

## 5. File structure (suggested)

```
src/ui/
  tokens.ts              color hex constants + glyph table
  symbols.ts             ✓ ● ◌ ⚙ ⚠ etc. as named exports
  StatusBar.tsx          always-visible bottom bar
  Welcome.tsx            hero + workspace card + runtime card + quickhelp
  SlashPalette.tsx       floating /command dropdown
  ToolLog.tsx            runner-style tool call list
  Pipeline.tsx           three agent cards + arrows
  ConfirmCard.tsx        inline diff + risk pill + action buttons
  ExplainCard.tsx        amber side-rail block
  RoleRow.tsx            role tag + body container (used by all)
  App.tsx                NEW — top-level state machine, picks screen by state
  App.legacy.tsx         OLD — archived, can be deleted later
```

---

## 6. State machine (where each screen renders)

```
boot ─→ welcome (first render only)
          │
          ▼
        idle (input active, no work)
          │  user submits prompt
          ▼
        thinking
          ├── if domain=chat: stream response → idle
          └── if domain=coding: pipeline visible
                  ├── planner runs (Pipeline shows P active)
                  ├── coder runs (Pipeline shows C active, ToolLog appends)
                  ├── reviewer runs (Pipeline shows R active)
                  ├── any tool requests confirm → ConfirmCard → user chooses
                  │     ├── y → resume
                  │     └── n → cancel, return to idle
                  └── completion → idle
          │
          ▼ (if explainMode)
        ExplainCard renders below the response

slash menu opens any time input starts with `/` and is interactive
status bar renders at all times, every screen
```

---

## 7. Build order — step by step execution plan

### Phase 1 — Foundation (build first, no UI changes yet)

**Step 1.1 — `src/ui/tokens.ts`**
Export the 12 color hex constants plus glyph map.
Acceptance: importable from any component, no inline hex anywhere else.

**Step 1.2 — `src/ui/symbols.ts`**
Export named symbol constants.
Acceptance: same — no string literals like `'✓'` outside this file.

**Step 1.3 — `src/ui/RoleRow.tsx`**
Reusable component: `<RoleRow role="you|glitool|tools|graph|plan|note" timestamp="14:33">{children}</RoleRow>`
Renders the small-caps role tag + body indented to the right.
Acceptance: can render any of the role tags above, time is optional.

### Phase 2 — Welcome + StatusBar

**Step 2.1 — `src/ui/StatusBar.tsx`**
Props: `{ state: 'idle' | 'ready' | 'working' | 'awaiting' | 'error', detail?: string, tier?: string, model: string, tokens: number, cost: number }`
Renders a single bottom line. State dot color follows §4.7 mapping.
Acceptance: visible at the bottom of the Ink output, updates when props change.

**Step 2.2 — `src/ui/Welcome.tsx`**
Props: `{ name: string, workspace: { path, branch, files, loc }, runtime: { model, toolsCount, explainOn } }`
Renders hero + two info boxes + quickhelp commands list.
Acceptance: prints once on app boot, never again unless `/clear`.

**Step 2.3 — `src/ui/App.tsx` (skeleton)**
Replace the existing `App.tsx`. New version: shows Welcome + StatusBar + the existing input/chat for now. Goal of this step is to swap the shell with new layout while keeping current chat logic.
Acceptance: tool runs, looks new, all old commands still work.

### Phase 3 — SlashPalette

**Step 3.1 — `src/ui/SlashPalette.tsx`**
Props: `{ input: string, selectedIndex: number, onSelect: (cmd: string) => void }`
Renders the dropdown box only when `input.startsWith('/')`.
Filters by prefix, supports ↑↓ via `useInput`.
Acceptance: typing `/m` shows `/model` and `/memory`, ↑↓ moves selection, Enter inserts.

**Step 3.2 — Wire SlashPalette into App.tsx**
Replace the existing `suggestions` array logic.
Acceptance: existing slash command suggestions removed; new palette takes over.

### Phase 4 — Tool log + Pipeline

**Step 4.1 — `src/ui/ToolLog.tsx`**
Props: `{ entries: Array<{ tool: string, target: string, status: 'done' | 'running' | 'queued', stat?: string }> }`
Renders the runner-style log block.
Acceptance: each tool call appends a row with the right state icon.

**Step 4.2 — `src/ui/Pipeline.tsx`**
Props: `{ planner: AgentState, coder: AgentState, reviewer: AgentState }`
Three horizontal cards with arrows. Stack vertically if `process.stdout.columns < 100`.
Acceptance: state changes live as agents progress.

**Step 4.3 — Wire ToolLog + Pipeline into App.tsx**
Replace the existing `isThinking` / `toolInfo` rendering.
Acceptance: complex queries show pipeline + tool log; chat queries skip them.

### Phase 5 — ConfirmCard

**Step 5.1 — `src/ui/ConfirmCard.tsx`**
Props: `{ files: Array<{ path: string, diff: string, added: number, removed: number }>, risk: 'low' | 'medium' | 'high', onChoice: (c: 'y' | 'n' | 'd') => void }`
Renders the inline unified diff with risk pill and action buttons.
Acceptance: shows on every `writeFile` / `editFile` confirmation, replaces the current `(y/n):` text.

**Step 5.2 — Wire ConfirmCard into the existing `requestConfirm` flow**
Replace the bare yellow text in the current confirm prompt with ConfirmCard.
Acceptance: any tool that calls `requestConfirm()` now shows the new card.

### Phase 6 — ExplainCard

**Step 6.1 — `src/ui/ExplainCard.tsx`**
Props: `{ children: ReactNode }`
Renders the amber-left-border block.
Acceptance: appears below any assistant response when `explainMode` is on.

**Step 6.2 — Wire into App.tsx**
Replace the existing magenta `explain` message rendering.
Acceptance: explain mode messages render as side-rail card, not as a bordered red/magenta box.

### Phase 7 — Polish

- Wire token count + cost tracking into StatusBar (need a simple counter that increments after each LLM call).
- Add the small `[router on]` chip with the current routing decision in the runtime card.
- Verify on narrow terminals (<80 cols): pipeline stacks, diff still readable.
- Delete `App.legacy.tsx`.

---

## 8. Acceptance checklist (v1 done when all true)

- [ ] All hex colors in `tokens.ts`, no inline hex elsewhere.
- [ ] StatusBar visible on every screen, updates live.
- [ ] Welcome prints once on launch; `/clear` does not re-print it.
- [ ] Typing `/` opens SlashPalette; Enter inserts; Esc dismisses.
- [ ] Coding queries show Pipeline + ToolLog; chat queries do not.
- [ ] Tool log rows show running spinner that animates.
- [ ] Every `writeFile` / `editFile` confirmation goes through ConfirmCard.
- [ ] Inline diff shows `+` in sage, `-` in rust, context in muted.
- [ ] Risk pill colors match level (low/medium → mustard, high → rust).
- [ ] Explain mode renders as side-rail, not magenta box.
- [ ] Pipeline cards stack vertically on terminals < 100 cols.
- [ ] No screen breaks on terminals 80 cols wide.

---

## 9. Notes for implementation

- **Ink box borders** — use `<Box borderStyle="single" borderColor={tokens.line}>...</Box>`. Rounded corners only on the input box.
- **Animated icons** — `useEffect` + `setInterval(200ms)` to cycle through frames. Pause when state changes.
- **Live token count** — wrap the LLM call in a function that adds `response.usage.total_tokens` to a counter passed up via context or a shared store.
- **Width detection** — `process.stdout.columns` for layout decisions. Default to 80 if undefined.
- **No `<Static>` for now** — Ink's `<Static>` could optimize scrolled-past content later, but skip for v1; rebuild full output on every render is fine for chat-scale data.
