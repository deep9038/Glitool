// REPLACE the whole file with:
import { runPlanner } from './planner.js';
import { runCoder } from './coder.js';
import { runReviewer } from './reviewer.js';
import { getModelForTier } from '../llm/router.js';
import type { RouteDecision } from '../llm/router.js';

const MAX_ITERATIONS = 1;

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
    let finalResponse = '';
    let approved = false;
    let iteration = 0;
    let reviewFeedback = '';

    while (!approved && iteration < MAX_ITERATIONS) {
        onStatus(`Executing plan${iteration > 0 ? ' (fixing issues)' : ''}...`);

        const planWithFeedback = iteration === 0
            ? plan
            : `${plan}\n\nReviewer feedback to address:\n${reviewFeedback}`;

        coderOutput = await runCoder(planWithFeedback, userMessage, onToolCall, coderModel);

        onStatus('Reviewing...');
        const review = await runReviewer(plan, coderOutput, userMessage, reviewerModel);
        approved = review.approved;
        finalResponse = review.finalResponse;
        reviewFeedback = review.feedback;

        if (!approved) {
            onStatus(`Reviewer found issues: ${review.feedback}`);
        }
        iteration++;
    }

    return finalResponse || coderOutput;
}
