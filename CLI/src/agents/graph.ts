import { Annotation, StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { runPlanner } from "./planner.js";
import { runCoder } from "./coder.js";
import { runJudge } from "./judge.js";
import { runValidator, formatValidationErrors } from "./validator.js";
import { buildTopology,formatTopologyAsPlan,topologySummary } from "./workflow.js";
import { getModelForTier } from "../llm/router.js";
import type { RouteDecision } from "../llm/router.js";
import type { PlanStep , Topology } from "./types.js";
import type { ValidationResult } from "./validator.js";
import type { JudgeResult } from "./judge.js";
import { format } from "node:path";


const MAX_CODER_RETRY = 2;
const MAX_JUDGE_ITERATIONS = 3;

const GraphState = Annotation.Root({

    userMessage: Annotation<string>({reducer: (_,b) => b}),
    systemPrompt: Annotation<string>({ reducer: (_,b) => b}),
    decision: Annotation<RouteDecision>({ reducer: (_,b) => b}),
    steps: Annotation<PlanStep[] | null>({ reducer: (_,b)=> b , default:() => null}),
    topology: Annotation<Topology | null>({ reducer: (_,b) => b, default:()=> null}),
    plan: Annotation<string>({ reducer: (_,b)=> b, default: () => ''}),
    coderOutput: Annotation<string>({ reducer: (_,b)=> b, default: () => ''}),
    validationResult: Annotation<ValidationResult | null>({ reducer: (_,b)=> b, default: ()=> null}),
    judgeResult: Annotation<JudgeResult | null>({ reducer: (_,b)=> b, default: ()=> null}),
    coderRetry: Annotation<number>({reducer: (_,b)=> b, default:()=>0}),
    judgeLoop: Annotation<number>({reducer: (_,b)=> b, default:()=>0}),
    lastFailurePoint: Annotation<string | null>({ reducer: (_,b)=>b, default: () => null}),
    plannerHint: Annotation<string>({ reducer: (_,b)=>b, default: () => ''}),
    finalOutput: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
})

type S = typeof GraphState.State;



export async function runAgentGraph( userMessage: string, systemPrompt: string, onToolCall: (name: string, args?: Record<string,any>) => void, onStatus: (status: string) => void, decision: RouteDecision ): Promise<string | null> {


    const plannerModel = getModelForTier('complex');
    const coderModel = decision.recommendedModel;
    const judgeModel = getModelForTier('complex');


    async function plannerNode(state: S){
        onStatus('Planning...');
        const prompt = state.plannerHint ? `${state.userMessage}\n\nPrevious attempt failed. Fix hint: ${state.plannerHint}` : state.userMessage
        const steps = await runPlanner(prompt, state.systemPrompt, plannerModel);
        return {steps,coderRetry: 0, plannerHint: ''};
    }



    async function  workflowNode(state:S){
        onStatus('Building execution plan ...');
        const topology = buildTopology(state.steps!);
        const plan = formatTopologyAsPlan(topology, state.steps!);
        onStatus(`Workflow: ${topologySummary(topology)}`);
        return {topology,plan}
    }


    async function coderNode(state:S){
        onStatus(`Executiong plan${state.coderRetry > 0 ? ` (fixing issues)` : ''}...`);
        const coderOutput = await runCoder(state.plan, state.userMessage, onToolCall, coderModel);
        return { coderOutput };
    }





    async function validatorNode(state:S){
        onStatus('Validating...');
        const validationResult = await runValidator();
        if (validationResult.overallOk) return { validationResult };
        const newRetry = state.coderRetry + 1;
        if (newRetry >= MAX_CODER_RETRY){
            return {validationResult, coderRetry: newRetry};
        }
        const feedback = formatValidationErrors(validationResult);
        onStatus(`Validation failed - retry ${newRetry}`);
        return {
            validationResult,
            coderRetry: newRetry,
            plan: `${state.plan}\n\nFix these issues:\n${feedback}`,
        };
    }


    async function judgeNode(state:S){
        onStatus(`Judging...`)
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


            const newJudgeLoop = state.judgeLoop + 1;
            const repeated = judgment.failure_point === state.lastFailurePoint;
            const escalate = newJudgeLoop >= MAX_JUDGE_ITERATIONS || repeated;

            if(judgment.verdict === 'ok' || escalate){
                if (escalate && judgment.verdict !==  'ok'){
                    onStatus(`Escalating after ${newJudgeLoop} attempts(S):${judgment.reason}`);
                }

                return {
                    judgeResult: judgment,
                    finalOutput: judgment.finalResponse || state.coderOutput,
                    judgeLoop: newJudgeLoop
                }
            }

            onStatus(`Judge: ${judgment.failure_point} - ${judgment.reason}`);


            if(judgment.failure_point === 'plan'){
                return{
                    judgeResult:      judgment,
                    judgeLoop:        newJudgeLoop,
                    lastFailurePoint: judgment.failure_point,
                    plannerHint:      judgment.fix_hint,
                    steps:            null,
                    plan:             '',
                    coderRetry:       0,
                };
            }


            return {
                judgeResult:      judgment,
                judgeLoop:        newJudgeLoop,
                lastFailurePoint: judgment.failure_point,
                plan:             `${state.plan}\n\nJudge feedback (attempt ${state.judgeLoop + 1}): ${judgment.fix_hint}`,
                coderRetry:       0,
            };
    }

    const routeAfterPlanner = (state:S) => state.steps === null ? END : 'workflow';


    const routeAfterValidator = (state:S) =>{
        if(state.validationResult?.overallOk) return 'judge';
        if (state.coderRetry >= MAX_CODER_RETRY) return 'judge';
        return 'coder';
    }

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
        { configurable: { thread_id: threadId } }
    );


    return result.finalOutput ?? null;

}