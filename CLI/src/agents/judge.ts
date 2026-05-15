import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { PlanStep, Topology } from "./types.js";
import type { ValidationResult } from "./validator.js";



export interface JudgeInput {
    userMessage: string;
    plan: string;
    steps: PlanStep[];
    topology: Topology;
    coderOutput: string;
    validationResult: ValidationResult;
    loopCount: number;
}


export interface JudgeResult {
    verdict: 'ok' | 'fail';
    failure_point: 'plan' | 'workflow' | 'execution' | 'final_output' | null;
    failure_step_id: number | null;
    reason: string;
    fix_hint: string;
    confidence: number;
    finalResponse: string;
}



export async function runJudge(input: JudgeInput,model: string): Promise<JudgeResult>{

    const llm = new ChatOpenAI({
        model,
        apiKey: process.env.OPENAI_API_KEY,
        modelKwargs: {response_format: {type: 'json_object'}},
    });


    const outputSummary = input.coderOutput.length > 500 ? input.coderOutput.slice(0,500) + '... (truncated)' : input.coderOutput;

    const validationSummary = input.validationResult.overallOk
        ? 'All checks passed.'
        : [
            !input.validationResult.tsc.ok    ? `${input.validationResult.tsc.errors.length} TS errors`   : '',
            !input.validationResult.eslint.ok ? `${input.validationResult.eslint.errors.length} lint errors` : '',
          ].filter(Boolean).join(', ');

    const response = await llm.invoke([
        new SystemMessage(`You are a code quality judge for an AI coding agent. Evaluate whether the coder fulfilled the user's request.

Return JSON only:
{
  "verdict": "ok" or "fail",
  "failure_point": "plan" | "workflow" | "executor" | "final_output" | null,
  "failure_step_id": number or null,
  "reason": "short explanation",
  "fix_hint": "specific instruction to fix the problem, empty if ok",
  "confidence": 0.0 to 1.0,
  "finalResponse": "message to show the user — summarize what was done or what went wrong"
}

failure_point meanings:
- "plan": the plan itself was wrong or incomplete — needs replanning
- "workflow": wrong execution order caused the failure
- "executor": a specific step failed — use failure_step_id
- "final_output": code runs but doesn't meet the requirement
- null: everything ok, verdict must be ok`),

        new HumanMessage(
            `User request: ${input.userMessage}\n\n` +
            `Plan:\n${input.plan}\n\n` +
            `What the coder did:\n${outputSummary}\n\n` +
            `Validation: ${validationSummary}\n\n` +
            `Attempt: ${input.loopCount + 1}`
        )
    ]);

    try {
        const cleaned = (response.content as string).replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    }catch{
        return{
            verdict: 'ok',
            failure_point: null,
            failure_step_id: null,
            reason: '',
            fix_hint: '',
            confidence: 0.5,
            finalResponse: input.coderOutput,
        };
    }
}