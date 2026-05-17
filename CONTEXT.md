# CONTEXT.md — How glitool finds the right code

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md), [TOOLS.md](./TOOLS.md), [ROUTING.md](./ROUTING.md), [MEMORY.md](./MEMORY.md).

This doc explains how the agent figures out which files matter for a given prompt — without loading the whole project into the LLM.

---

## 1. The problem

A naive "give the LLM the whole codebase" approach burns tokens fast:

- 200 files × ~3KB each = 600KB of context
- At ~4 chars/token → ~150,000 tokens
- One turn costs more than a year of Pro plan

The fix: **let the LLM ask for exactly what it needs, one piece at a time**.

---

## 2. Session start (zero LLM calls)

When you run `glitool` in a folder, three things happen — none of them touch the LLM:

| Step | What loads | Cost |
|---|---|---|
| Load project memory | `~/.glitool/project.json` if present | 0 tokens |
| Load last session summary | `~/.glitool/sessions/<hash>.json` if present | 0 tokens |
| Render Welcome UI | Static UI, file tree pulled lazily | 0 tokens |

No file scan. No embeddings. No upfront indexing.

---

## 3. The six tools that do all the work

Every coding turn flows through a ReAct loop. The Coder agent picks a tool, sees the result, and decides what to do next.

| Tool | Returns | Used for |
|---|---|---|
| `listFiles({ pattern? })` | File tree, optionally globbed | "what's in this project" |
| `searchCode({ query })` | grep across files, returns `file:line` matches | "where is X defined or used" |
| `readFile({ filePath })` | Full contents of one file | "show me this specific file" |
| `editFile({ filePath, old, new })` | Patches a file (with diff confirm) | targeted edit |
| `writeFile({ filePath, content })` | Creates a file (with confirm) | new file |
| `bash({ command })` | Shell command output (with risk gate) | tsc, npm, git, run tests |

These are deliberately small and orthogonal. No "smart" overlap — each does one thing.

---

## 4. End-to-end: a real prompt

You type:
```
fix the bug in the login flow
```

The Coder's LLM walks through this on its own:

```
1. LLM reads prompt + system prompt (with memory)
   "User says 'login flow' — I don't know where that lives."

2. LLM calls searchCode({ query: "login" })
   ← returns: "src/auth/login.ts:14
                src/auth/login.test.ts:3
                src/routes/index.ts:22"

3. LLM thinks: "src/auth/login.ts is the implementation. Read it."

4. LLM calls readFile({ filePath: "src/auth/login.ts" })
   ← returns: 80 lines of code

5. LLM spots the bug: missing await on line 32.

6. LLM calls editFile({
       filePath: "src/auth/login.ts",
       old:  "validateUser(input)",
       new:  "await validateUser(input)"
   })
   ← UI shows the diff, asks y/n
   ← user presses y → patch applied
```

**Total context consumed:** roughly the user prompt + system prompt + one grep result + one file.
Maybe 2,000–4,000 tokens.

Versus `readProject` (the old approach): the same task would have loaded the entire repo upfront — easily 100,000+ tokens, most of it irrelevant.

---

## 5. Why no embeddings (yet)

You'd expect semantic vector search ("nearest neighbor on chunked embeddings"). Glitool deliberately doesn't have it.

Reasons:
- **Grep is good enough.** Function names, variable names, file paths — these are concrete strings. `searchCode("login")` finds it. No embedding needed.
- **Cost.** Embeddings require generating + storing vectors per file. Runtime + storage overhead.
- **Drift.** As files change, embeddings go stale unless reindexed.
- **Hidden failure mode.** If the embedding misses, the LLM gets nothing back, doesn't know to retry with a different search.

A search using `searchCode` is auditable: you see the matches in the tool log. The LLM knows what it found and what it didn't.

Embeddings will land later for unstructured prose (PDFs, design docs) where grep is too literal. For source code, grep wins.

---

## 6. Cross-session memory — why the second run feels smarter

After you type `/exit`, two LLM calls run in the background:

**Session summary** (~500 tokens, written by an LLM):

```
User worked on the login bug in src/auth/login.ts. Added missing await on
validateUser call. Pattern is async/await throughout, validation uses Zod
schemas in src/auth/schemas/. Next likely step: JWT refresh logic in
src/auth/tokens.ts.
```

**Project facts** (extracted observable state):

```json
{
  "stack": ["TypeScript", "Express", "Zod"],
  "convention": "async/await",
  "keyFiles": ["src/auth/login.ts", "src/db/users.ts"],
  "testRunner": "vitest"
}
```

Both files live in `~/.glitool/`. Next session prepends them to the system prompt. The Coder starts already knowing:
- What the project is
- How you write code
- What was last worked on
- Which files are central

No re-discovery needed. No "tell the LLM about the project" round trips.

---

## 7. Summary

```
Session start:    load memory + facts        (0 LLM calls)
Prompt arrives:   route                     (regex or one LLM call)
Coder turn:       LLM picks tools per step  (grep → readFile → editFile)
Session end:      summarize + extract facts (2 LLM calls)
```

The system never loads more than it needs. The "smart" part isn't a clever indexing algorithm — it's six small tools and an LLM that knows when to use each.

---

## 8. What's not built yet

- Vector embeddings for non-code documents
- Symbol-level lookup (`go to definition`-style)
- Call-graph analysis
- File importance ranking by edit frequency
- Cross-repo memory (each project has its own facts file)

Whether to add any of these depends on what failures show up in real use. So far, grep + readFile + the planner's intent inference handles ~95% of prompts in <5,000 tokens of context.
