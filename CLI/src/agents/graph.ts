import { Annotation, StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { runPlanner } from "./planner.js";
import { runCoder } from "./coder.js";
import { runJudge } from "./judge.js";
import { runValidator, formatValidationErrors } from "./validator.js";
import { buildTopology, formatTopologyAsPlan, topologySummary } from "./workflow.js";
import { getModelForTier } from "../llm/router.js";
import type { RouteDecision } from "../llm/router.js";
import type { PlanStep, Topology } from "./types.js";
import type { ValidationResult } from "./validator.js";
import type { JudgeResult } from "./judge.js";
import type { ProcessEvent } from "../processEvents.js";
import fg from 'fast-glob';

const MAX_CODER_RETRY = 2;
const MAX_JUDGE_ITERATIONS = 3;

export interface TrajectoryEntry {
    iteration: number;
    verdict: 'ok' | 'fail';
    failure_point: string | null;
    reason: string;
    fix_hint: string;
}

export interface GraphResult {
    finalOutput: string | null;
    escalated: boolean;
    trajectory: TrajectoryEntry[];
    userMessage: string;
    plan: string;
}

const GraphState = Annotation.Root({
    userMessage:      Annotation<string>({ reducer: (_, b) => b }),
    systemPrompt:     Annotation<string>({ reducer: (_, b) => b }),
    decision:         Annotation<RouteDecision>({ reducer: (_, b) => b }),
    steps:            Annotation<PlanStep[] | null>({ reducer: (_, b) => b, default: () => null }),
    topology:         Annotation<Topology | null>({ reducer: (_, b) => b, default: () => null }),
    plan:             Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    coderOutput:      Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    validationResult: Annotation<ValidationResult | null>({ reducer: (_, b) => b, default: () => null }),
    judgeResult:      Annotation<JudgeResult | null>({ reducer: (_, b) => b, default: () => null }),
    coderRetry:       Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    judgeLoop:        Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    lastFailurePoint: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
    plannerHint:      Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    finalOutput:      Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
    trajectory:       Annotation<TrajectoryEntry[]>({ reducer: (_, b) => b, default: () => [] }),
    escalated:        Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
});

type S = typeof GraphState.State;

function extractTarget(args?: Record<string, any>): string {
    if (!args) return '';
    const first = Object.values(args)[0];
    if (typeof first === 'string') {
        try {
            const p = JSON.parse(first);
            return p.command ?? p.filePath ?? p.pattern ?? p.query ?? first;
        } catch { return first; }
    }
    if (typeof first === 'object' && first !== null) {
        return (first as any).command ?? (first as any).filePath ?? JSON.stringify(first).slice(0, 50);
    }
    return String(first ?? '');
}



interface ProjectContext {
    isEmpty: boolean;
    fileCount: number;
    fileTree: string;
    hasPackageJson: boolean;
    summary: string;
}

// Look at the folder BEFORE planning, so the planner knows what it's working with.
async function inspectProject(): Promise<ProjectContext> {
    const files = await fg(['**/*.{ts,tsx,js,jsx,json,html,css,md}'], {
        cwd: process.cwd(),
        ignore: ['node_modules/**', 'dist/**', '.next/**', '.git/**', 'build/**'],
        onlyFiles: true,
        suppressErrors: true,
    });
    const codeFiles = files.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
    const isEmpty = codeFiles.length === 0;
    const hasPackageJson = files.includes('package.json');
    const fileTree = files.slice(0, 200).join('\n');

    let summary: string;
    if (isEmpty && !hasPackageJson) {
        summary = 'EMPTY PROJECT — no source files. Build from scratch with "create" steps.';
    } else if (hasPackageJson) {
        summary = `EXISTING PROJECT — ${files.length} files, has package.json. Edit/extend existing code.`;
    } else {
        summary = `PARTIAL PROJECT — ${files.length} files, no package.json yet.`;
    }
    return { isEmpty, fileCount: files.length, fileTree, hasPackageJson, summary };
}











export async function runAgentGraph(
    userMessage: string,
    systemPrompt: string,
    onToolCall: (name: string, args?: Record<string, any>) => void,
    onStatus: (status: string) => void,
    decision: RouteDecision,
    onStageEvent?: (event: ProcessEvent) => void
): Promise<GraphResult> {

    const plannerModel = getModelForTier('complex');
    const coderModel   = decision.recommendedModel;
    const judgeModel   = getModelForTier('complex');


    async function plannerNode(state: S) {
        onStatus('Planning...');
        onStageEvent?.({ type: 'stage_start', stage: 'planner' });

 
        const project = await inspectProject();
        onStageEvent?.({ type: 'reasoning', stage: 'planner', text: project.summary });

        const groundedSystemPrompt = project.isEmpty
            ? `${state.systemPrompt}\n\n=== PROJECT STATE: ${project.summary} ===\nPlan ONLY "create" steps (plus "run" steps for install/scaffold commands). Use real, conventional paths for the stack (e.g. package.json, app/page.tsx, src/index.ts). Do NOT plan "read", "search", or "edit" steps — there is nothing to read or edit.`
            : `${state.systemPrompt}\n\n=== PROJECT STATE: ${project.summary} ===\n=== Project file tree (use exact paths when planning edits) ===\n${project.fileTree}`;






        const prompt = state.plannerHint
            ? `${state.userMessage}\n\nPrevious attempt failed. Fix hint: ${state.plannerHint}`
            : state.userMessage;
        const steps = await runPlanner(prompt, groundedSystemPrompt, plannerModel);

        if (steps?.length) {
            const planText = steps
                .map((s) => `${s.id}. ${s.action} ${s.target} — ${s.why}`)
                .join('\n');
            onStageEvent?.({ type: 'reasoning', stage: 'planner', text: planText });
        }
        onStageEvent?.({ type: 'stage_done', stage: 'planner' });

        return { steps, coderRetry: 0, plannerHint: '' };
    }


    async function workflowNode(state: S) {
        onStatus('Building execution plan...');
        const topology = buildTopology(state.steps!);
        const plan = formatTopologyAsPlan(topology, state.steps!);
        onStatus(`Workflow: ${topologySummary(topology)}`);
        return { topology, plan };
    }


    async function coderNode(state: S) {
        onStatus(`Executing plan${state.coderRetry > 0 ? ' (fixing issues)' : ''}...`);
        onStageEvent?.({ type: 'stage_start', stage: 'coder' });

        const wrappedOnToolCall = (name: string, args?: Record<string, any>) => {
            onStageEvent?.({ type: 'tool', stage: 'coder', tool: name, target: extractTarget(args) });
            onToolCall(name, args);
        };

        const coderOutput = await runCoder(
            state.plan,
            state.userMessage,
            wrappedOnToolCall,
            coderModel,
            (text) => onStageEvent?.({ type: 'reasoning', stage: 'coder', text })
        );

        onStageEvent?.({ type: 'stage_done', stage: 'coder' });
        return { coderOutput };
    }


    async function validatorNode(state: S) {
        onStatus('Validating...');
        onStageEvent?.({ type: 'stage_start', stage: 'validator' });

        const validationResult = await runValidator();
        const errCount = validationResult.tsc.errors.length + validationResult.eslint.errors.length;
        const summary = validationResult.overallOk
            ? 'No errors found.'
            : `${errCount} error(s) found — will retry.`;
        onStageEvent?.({ type: 'reasoning', stage: 'validator', text: summary });
        onStageEvent?.({ type: 'stage_done', stage: 'validator' });

        if (validationResult.overallOk) return { validationResult };
        const newRetry = state.coderRetry + 1;
        if (newRetry >= MAX_CODER_RETRY) {
            return { validationResult, coderRetry: newRetry };
        }
        const feedback = formatValidationErrors(validationResult);
        onStatus(`Validation failed - retry ${newRetry}`);
        return {
            validationResult,
            coderRetry: newRetry,
            plan: `${state.plan}\n\nFix these issues:\n${feedback}`,
        };
    }


    async function judgeNode(state: S) {
        onStatus('Judging...');
        onStageEvent?.({ type: 'stage_start', stage: 'judge' });

        const judgment = await runJudge(
            {
                userMessage:      state.userMessage,
                plan:             state.plan,
                steps:            state.steps!,
                topology:         state.topology!,
                coderOutput:      state.coderOutput,
                validationResult: state.validationResult!,
                loopCount:        state.judgeLoop,
            },
            judgeModel
        );

        const verdictText = judgment.verdict === 'ok'
            ? `All tasks complete. ${judgment.reason}`
            : `Issue: ${judgment.reason}`;
        onStageEvent?.({ type: 'reasoning', stage: 'judge', text: verdictText });
        onStageEvent?.({ type: 'stage_done', stage: 'judge' });

        const newJudgeLoop = state.judgeLoop + 1;
        const repeated = judgment.failure_point === state.lastFailurePoint;
        const escalate = newJudgeLoop >= MAX_JUDGE_ITERATIONS || repeated;

        const newTrajectory: TrajectoryEntry[] = [
            ...state.trajectory,
            {
                iteration:     newJudgeLoop,
                verdict:       judgment.verdict,
                failure_point: judgment.failure_point,
                reason:        judgment.reason,
                fix_hint:      judgment.fix_hint,
            },
        ];

        if (judgment.verdict === 'ok' || escalate) {
            const didEscalate = escalate && judgment.verdict !== 'ok';
            if (didEscalate) {
                onStatus(`Escalating after ${newJudgeLoop} attempts: ${judgment.reason}`);
            }
            return {
                judgeResult: judgment,
                finalOutput: judgment.finalResponse || state.coderOutput,
                judgeLoop:   newJudgeLoop,
                trajectory:  newTrajectory,
                escalated:   didEscalate,
            };
        }

        onStatus(`Judge: ${judgment.failure_point} - ${judgment.reason}`);

        if (judgment.failure_point === 'plan') {
            return {
                judgeResult:      judgment,
                judgeLoop:        newJudgeLoop,
                lastFailurePoint: judgment.failure_point,
                plannerHint:      judgment.fix_hint,
                steps:            null,
                plan:             '',
                coderRetry:       0,
                trajectory:       newTrajectory,
            };
        }

        return {
            judgeResult:      judgment,
            judgeLoop:        newJudgeLoop,
            lastFailurePoint: judgment.failure_point,
            plan:             `${state.plan}\n\nJudge feedback (attempt ${state.judgeLoop + 1}): ${judgment.fix_hint}`,
            coderRetry:       0,
            trajectory:       newTrajectory,
        };
    }


    const routeAfterPlanner = (state: S) => state.steps === null ? END : 'workflow';

    const routeAfterValidator = (state: S) => {
        if (state.validationResult?.overallOk) return 'judge';
        if (state.coderRetry >= MAX_CODER_RETRY) return 'judge';
        return 'coder';
    };

    const routeAfterJudge = (state: S) => {
        if (state.finalOutput !== null) return END;
        if (state.judgeResult?.failure_point === 'plan') return 'planner';
        return 'coder';
    };


    const app = new StateGraph(GraphState)
        .addNode('planner',   plannerNode)
        .addNode('workflow',  workflowNode)
        .addNode('coder',     coderNode)
        .addNode('validator', validatorNode)
        .addNode('judge',     judgeNode)
        .addEdge(START,       'planner')
        .addConditionalEdges('planner',   routeAfterPlanner)
        .addEdge('workflow',  'coder')
        .addEdge('coder',     'validator')
        .addConditionalEdges('validator', routeAfterValidator)
        .addConditionalEdges('judge',     routeAfterJudge)
        .compile({ checkpointer: new MemorySaver() });

    const threadId = `graph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const result = await app.invoke(
        { userMessage, systemPrompt, decision },
        { configurable: { thread_id: threadId }, recursionLimit: 50 }
    );

    return {
        finalOutput: result.finalOutput ?? null,
        escalated:   result.escalated ?? false,
        trajectory:  result.trajectory ?? [],
        userMessage: result.userMessage,
        plan:        result.plan,
    };
}
