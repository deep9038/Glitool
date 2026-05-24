import { makeLlm } from '../llm/factory.js';

import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { existsSync,readFileSync,writeFileSync } from "fs";
import { join } from "path";



const PLAN_FILE = "plan.md";
const BLOCKED_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs'];


export async function runPlanningAgent(userMessage: string,onUsage?: (inputTokens: number, outputTokens: number) => void): Promise<string> {

    const llm = makeLlm('openai/gpt-oss-120b');
    const planPath = join(process.cwd(),PLAN_FILE);
    const existingPlan = existsSync(planPath) ? readFileSync(planPath,'utf-8') : null;
    const systemPrompt = existingPlan
    ? `You are a planning assistant. The user has an existing plan.md and wants to update it.

You receive: (1) the current plan, (2) the user's change request.

OUTPUT:
- The FULL updated plan in Markdown — this overwrites plan.md.
- After the plan, write exactly "---" on its own line.
- Then 1-3 bullets summarising what changed.

RULES:
- Preserve sections the user didn't ask to change.
- Apply requested changes precisely; don't expand scope.
- If the request is ambiguous, ask ONE clarifying question instead of guessing.
- Never delete existing sections unless the user explicitly says to.
- Avoid writing implementation code; this is planning, not execution.`
    : `You are a planning assistant. Create a clear structured plan based on user's request.

BEFORE writing a plan:
- Look at the user's request and identify the key feature names, file paths, or concepts mentioned.
- If the request mentions specific files (e.g. "graph.ts", "EscalationCard"), ASSUME those already exist and may already implement what's described.
- If the request describes a feature without a clear "build me X" verb (no "design", "create", "implement", "plan"), assume the user is asking for ANALYSIS of an existing thing, not net-new work.

In your plan, do NOT invent assumptions. If you don't know something, write "QUESTION: ..." and ask the user.

Rules:
- Use Markdown with clear sections and numbered steps
- Be specific: name files, components, decisions, trade-offs
- If the request is vague, prefer asking 1-2 clarifying questions over guessing
- After the plan, write exactly "---" on its own line, then 1-3 bullet points summarising what you created`;

    const userContent = existingPlan ? `Current plan:\n\n${existingPlan}\n\nUser request:${userMessage}`:userMessage;
    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userContent)
    ]);
    const usage = response.usage_metadata;
    if (usage) onUsage?.(usage.input_tokens ?? 0, usage.output_tokens ?? 0);
    const content = response.content as string;
    const splitIndex = content.lastIndexOf('\n---\n');
    const planBody = splitIndex !== -1 ? content.slice(0, splitIndex).trim() : content.trim();
    const changeSummary = splitIndex !== -1 ? content.slice(splitIndex + 5).trim() : 'Plan saved.';

    writeFileSync(planPath,planBody,'utf-8');
    const action = existingPlan ? 'updated' : 'created';
    return `**plan.md ${action}**\n\n${changeSummary}`;
}