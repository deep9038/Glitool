import { makeLlm } from '../llm/factory.js';
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { PlanStep } from "./types.js";

export async function runPlanner(
    userMessage: string,
    context: string,
    model: string
): Promise<PlanStep[] | null> {
    const llm = makeLlm(model);


    const response = await llm.invoke([
        new SystemMessage(`You are a coding task planner. Output a structured JSON plan.

Output exactly one of:

A) The literal text:  SIMPLE
   (use when the task is just a question, explanation, or chat — no file changes or code execution needed)

B) A JSON array of 3-6 steps:
[
  { "id": 1, "action": "read",   "target": "src/auth.ts",     "depends_on": [], "why": "understand current login flow" },
  { "id": 2, "action": "edit",   "target": "src/auth.ts",     "depends_on": [1], "why": "add refresh-token check before validate" },
  { "id": 3, "action": "run",    "target": "npx tsc --noEmit","depends_on": [2], "why": "verify it compiles" }
]

Action values:
- "read":   open a file to understand it
- "edit":   modify an existing file
- "create": make a new file
- "run":    execute a shell command (tsc, npm, git, etc.)
- "search": grep the codebase

Rules:
- Output ONLY the SIMPLE literal OR the JSON array. No prose, no markdown, no code fences.
- Steps that can run in parallel: leave depends_on empty.
- Sequential dependencies: list step ids in depends_on.
- Be specific about file paths and command names — vague targets cause failures.
- For scaffolders (create-next-app, create-vite, npx ... init, vue create, etc.): plan a SINGLE "run" step for the scaffolder. Do NOT also plan "create" steps for files the scaffolder itself produces (create-next-app already creates app/page.tsx, app/layout.tsx, package.json, etc.). Plan "create" steps ONLY for ADDITIONS beyond the scaffold (custom components, content sections, or files the user explicitly asked for).`),

        new HumanMessage(`Context:\n${context}\n\nUser request: ${userMessage}`)
    ]);

    const content = (response.content as string).trim();

    if (content === 'SIMPLE') return null;

    try {
        const cleaned = content.replace(/```json|```/g, '').trim();
        const steps: PlanStep[] = JSON.parse(cleaned);
        if (Array.isArray(steps) && steps.length > 0) return steps;
        throw new Error('empty array');
    } catch {
        // Planner returned prose / a question instead of JSON. Don't fabricate a
        // fake "edit" step — that sends the coder hunting for files that may not
        // exist. Return null = "no plan", so the pipeline falls back to a normal
        // conversational reply where the user can be asked properly.
        return null;
    }
}
