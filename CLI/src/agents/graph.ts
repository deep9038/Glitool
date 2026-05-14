// REPLACE the whole file with:
import { runPlanner } from './planner.js';
import { runCoder } from './coder.js';
import { runReviewer } from './reviewer.js';
import { getModelForTier } from '../llm/router.js';
import { runValidator, formatValidationErrors } from './validator.js';
import type { RouteDecision } from '../llm/router.js';

const MAX_CODER_RETRY  = 2;

export async function runAgentGraph(
    userMessage: string,
    systemPrompt: string,
    onToolCall: (name: string, args?: Record<string, any>) => void,
    onStatus: (status: string) => void,
    decision: RouteDecision
): Promise<string | null> {

    const plannerModel  = getModelForTier('complex');
    const coderModel    = decision.recommendedModel;
    const reviewerModel = getModelForTier('standard');

    onStatus('Planning...');
    const plan = await runPlanner(userMessage, systemPrompt, plannerModel);

    if (plan.trim() === 'SIMPLE') {
        return null;
    }

    let coderOutput = '';
    let feedback = '';
    let retry = 0;


    while (retry < MAX_CODER_RETRY) {
        onStatus(`Executing plan${retry > 0 ? ' (fixing validation errors)' : ''}...`);
        const planWithFeedback = feedback ? `${plan}\n\nFix these issues:\n${feedback}` : plan;
        coderOutput = await runCoder(planWithFeedback, userMessage, onToolCall, coderModel);

        onStatus('Validating...');
        const validation = await runValidator();

        if (validation.overallOk) break;

        feedback = formatValidationErrors(validation);
        onStatus(`Validation failed (${validation.tsc.errors.length} TS, ${validation.eslint.errors.length} lint)`);
        retry++;
    }



    onStatus('Reviewing...');
    const review = await runReviewer(plan, coderOutput, userMessage, reviewerModel);
    const finalResponse = review.finalResponse;

    return finalResponse || coderOutput;
    
}
