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

Rules:
- If the task is ONLY a question or explanation with NO file creation or code execution needed, output exactly: SIMPLE
- Otherwise output a JSON array of steps with this shape:
  [{ "id": 1, "action": "read|edit|create|run|search", "target": "file/path or command", "depends_on": [], "why": "reason" }]
- Be specific about which files to read, edit, or create
- Do NOT write any code — only plan the steps
- Keep it to 3-6 steps maximum
- Steps that can run independently should have no shared depends_on
- depends_on contains the ids of steps that must finish before this one`),
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
        // Fallback — treat the whole response as a single unstructured step
        return [{
            id: 1,
            action: 'edit',
            target: 'project',
            depends_on: [],
            why: content,
        }];
    }
}
