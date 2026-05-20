import {  writeFileTool, listFilesTool, readFileTool, searchCodeTool,editFileTool,bashTool, readBackgroundOutputTool,webFetchTool,} from "./tools/index.js";
import { AIMessage, BaseMessage,HumanMessage,SystemMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { loadSession,loadSummary,saveSession,generateAndSaveSummary  } from "./memory.js";
import { loadConfig } from "./config.js";
import { loadProjectMemory } from "./projectMemory.js";
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { route, stripExplicitPrefix } from './llm/router.js';
import { logRouting } from './llm/telemetry.js';
import { runAgentGraph } from "./agents/graph.js";
import { runReviewer } from "./agents/reviewer-agent.js";
import os from 'os';
import { cleanupAll } from "./tools/processRegistry.js";
import { runPlanningAgent } from "./agents/planningAgent.js";
import type { EscalationPayload } from "./ui/EscalationCard.js";
import { runDebugger } from "./agents/debugger.js";
import { runRefactorer } from "./agents/refactorer.js";
import { runGitAgent } from "./agents/git-agent.js";
import { ToolMessage } from "@langchain/core/messages";
import type { ProcessEvent } from './processEvents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: join(os.homedir(), '.glitool', '.env') });

const MAX_HISTORY_CHARS = 60_000;

const simpleLlm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
});






function createLlm(model: string): ChatOpenAI{
    return new ChatOpenAI({model,apiKey:process.env.OPENAI_API_KEY})
}
export const llm = createLlm('gpt-4o-mini');



const config = loadConfig();



const tools: StructuredTool[] = [listFilesTool, readFileTool, searchCodeTool, writeFileTool, editFileTool,bashTool,readBackgroundOutputTool,webFetchTool];
process.on('exit', cleanupAll);
process.on('SIGINT', () => { cleanupAll(); process.exit(0); });
process.on('SIGTERM', () => { cleanupAll(); process.exit(0); });
export const sessionMessages: BaseMessage[] = loadSession()


export function clearSession(): void {
    sessionMessages.length = 0;
    saveSession(sessionMessages);
}

const MAX_SUMMARY_CHARS = 2_000;
const MAX_PROJECT_FACTS_CHARS = 3_000;


function buildSystemPrompt(): string {
    let summary = loadSummary();
    const project = loadProjectMemory();

    if (!summary) {
        const rawSession = loadSession();
        if (rawSession.length > 4) {
            generateAndSaveSummary(rawSession, llm);
            summary = loadSummary();
        }
    }

    let prompt = `You are an expert coding assistant. Be concise and code-focused.

CRITICAL — file operations:
- When the user asks to read, show, view, or display a file, you MUST call the readFile tool. NEVER answer from memory or guess at file contents.
- When the user asks if a file exists, you MUST call listFiles or readFile to verify. NEVER claim a file is missing without checking.
- For "read <name>" prompts, call readFile with the bare name — the tool will search the project automatically.

IMPORTANT: If any tool returns USER_CANCELLED, immediately stop all tool calls and tell the user the operation was cancelled. Never retry a cancelled operation.`;

    if (summary) {
        const capped = summary.length > MAX_SUMMARY_CHARS
            ? summary.slice(0, MAX_SUMMARY_CHARS) + '\n…[summary truncated]'
            : summary;
        prompt += `\n\nPrevious session summary:\n${capped}`;
    }

    if (project) {
        const json = JSON.stringify(project, null, 2);
        const capped = json.length > MAX_PROJECT_FACTS_CHARS
            ? json.slice(0, MAX_PROJECT_FACTS_CHARS) + '\n…[truncated]'
            : json;
        prompt += `\n\nProject facts:\n${capped}`;
    }
    return prompt;
}


const systemPrompt = await buildSystemPrompt();



async function tryDirectReadShortcut(
    prompt: string,
    onToolCall: (name: string, args?: Record<string, any>) => void
): Promise<string | null> {
    const match = prompt.trim().match(/^(?:read|show|open|cat|view|display|print)\s+(.+?)$/i);
    if (!match) return null;

    const target = match[1].trim().replace(/^["']|["']$/g, '');
    if (!target || target.includes(' ')) return null;

    onToolCall('readFile', { filePath: target });

    let raw: string;
    try {
        raw = await (readFileTool as any).invoke({ filePath: target });
    } catch (err: any) {
        return `Could not read ${target}: ${err?.message ?? 'unknown error'}`;
    }
    if (typeof raw !== 'string') raw = String(raw);

    // Strip the smart-resolve header if present and remember the real path.
    let resolvedPath = target;
    let body = raw;
    const resolveMatch = raw.match(/^\[resolved ".*?" → (.+?)\]\n\n([\s\S]*)$/);
    if (resolveMatch) {
        resolvedPath = resolveMatch[1];
        body = resolveMatch[2];
    }

    const allLines = body.split('\n');
    const totalLines = allLines.length;
    const PREVIEW_LINES = 40;

    const preview = allLines.slice(0, PREVIEW_LINES).join('\n');
    const more =
        totalLines > PREVIEW_LINES
            ? `\n\n[...${totalLines - PREVIEW_LINES} more lines — open ${resolvedPath} in your editor for the full file, or ask me a question about it]`
            : '';

    return `Read ${resolvedPath} (${totalLines} lines):\n\n${preview}${more}`;
}



function trimHistory(messages: BaseMessage[]): BaseMessage[] {
    // Pass 1: keep only well-formed turns (HumanMessage + final non-tool AIMessage).
    // Drop empty AI messages and any AIMessage that requested a tool — they'd be orphaned without their ToolMessage.
    const cleaned: BaseMessage[] = [];
    for (const m of messages) {
        if (m instanceof HumanMessage) {
            cleaned.push(m);
            continue;
        }
        if (m instanceof AIMessage) {
            const hasToolCalls =
                (Array.isArray((m as any).tool_calls) && (m as any).tool_calls.length > 0) ||
                (Array.isArray((m as any).additional_kwargs?.tool_calls) &&
                    (m as any).additional_kwargs.tool_calls.length > 0);
            if (!hasToolCalls && typeof m.content === 'string' && m.content.trim()) {
                cleaned.push(m);
            }
        }
        // ToolMessage and anything else: drop
    }

    // Pass 2: char budget, walking backwards.
    let totalChars = 0;
    const kept: BaseMessage[] = [];
    for (let i = cleaned.length - 1; i >= 0; i--) {
        const content =
            typeof cleaned[i].content === 'string'
                ? cleaned[i].content
                : JSON.stringify(cleaned[i].content);
        totalChars += content.length;
        if (totalChars > MAX_HISTORY_CHARS) break;
        kept.unshift(cleaned[i]);
    }
    return kept;
}

const COST_PER_TOKEN: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini':  { input: 0.15  / 1_000_000, output: 0.60  / 1_000_000 },
    'gpt-5.4-mini': { input: 0.75  / 1_000_000, output: 4.50  / 1_000_000 },
    'gpt-5.4':      { input: 2.50  / 1_000_000, output: 15.00 / 1_000_000 },
    'gpt-5.5':      { input: 5.00  / 1_000_000, output: 30.00 / 1_000_000 },
};


function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const rates = COST_PER_TOKEN[model] ?? COST_PER_TOKEN['gpt-4o-mini'];
    return inputTokens * rates.input + outputTokens * rates.output;
}


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




export async function chat(
    userInput: string,
    onToolCall: (name: string, args?: Record<string, any>) => void,
    onStatus?: (status: string) => void,
    onToken?: (token: string) => void,
    onEscalation?: (payload: EscalationPayload) => void,
    onUsage?: (tokens: number, cost: number) => void,
    onStageEvent?: (event: ProcessEvent) => void
): Promise<string> {
    
    const decision = await route(userInput, sessionMessages.slice(-6));

    logRouting(userInput, decision);
    const cleanedInput = decision.source === 'explicit' ? stripExplicitPrefix(userInput) : userInput;

    sessionMessages.push(new HumanMessage(cleanedInput));
    const shortcut = await tryDirectReadShortcut(cleanedInput, onToolCall);
    if (shortcut !== null) {
        sessionMessages.push(new AIMessage(shortcut));
        saveSession(sessionMessages);
        return shortcut;
    }


    if (decision.domain === 'planning') {
        onStatus?.('Planning...');
        const result = await runPlanningAgent(cleanedInput, (inputTokens, outputTokens) => {
            onUsage?.(
                inputTokens + outputTokens,
                estimateCost('gpt-5.4', inputTokens, outputTokens)
            );
        });
        sessionMessages.push(new AIMessage(result));
        saveSession(sessionMessages);
        return result;
    }


   if (decision.domain === 'review') {
        onStageEvent?.({ type: 'stage_start', stage: 'reviewer' });
        const result = await runReviewer(
            cleanedInput,
            (name, args) => {
                onStageEvent?.({ type: 'tool', stage: 'reviewer', tool: name, target: extractTarget(args) });
                onToolCall(name, args);
            },
            decision.recommendedModel
        );
        onStageEvent?.({ type: 'stage_done', stage: 'reviewer' });
        sessionMessages.push(new AIMessage(result));
        saveSession(sessionMessages);
        return result;
    }


    if (decision.domain === 'debugging') {
        onStageEvent?.({ type: 'stage_start', stage: 'debugger' });
        const result = await runDebugger(
            cleanedInput,
            (name, args) => {
                onStageEvent?.({ type: 'tool', stage: 'debugger', tool: name, target: extractTarget(args) });
                onToolCall(name, args);
            },
            decision.recommendedModel
        );
        onStageEvent?.({ type: 'stage_done', stage: 'debugger' });
        sessionMessages.push(new AIMessage(result));
        saveSession(sessionMessages);
        return result;
    }




    if (decision.domain === 'refactoring') {
        onStageEvent?.({ type: 'stage_start', stage: 'refactorer' });
        const result = await runRefactorer(
            cleanedInput,
            (name, args) => {
                onStageEvent?.({ type: 'tool', stage: 'refactorer', tool: name, target: extractTarget(args) });
                onToolCall(name, args);
            },
            decision.recommendedModel
        );
        onStageEvent?.({ type: 'stage_done', stage: 'refactorer' });
        sessionMessages.push(new AIMessage(result));
        saveSession(sessionMessages);
        return result;
    }

    if (decision.domain === 'git') {
        onStageEvent?.({ type: 'stage_start', stage: 'git_agent' });
        const result = await runGitAgent(
            cleanedInput,
            (name, args) => {
                onStageEvent?.({ type: 'tool', stage: 'git_agent', tool: name, target: extractTarget(args) });
                onToolCall(name, args);
            },
            decision.recommendedModel
        );
        onStageEvent?.({ type: 'stage_done', stage: 'git_agent' });
        sessionMessages.push(new AIMessage(result));
        saveSession(sessionMessages);
        return result;
    }





    if (decision.domain === 'coding') {
        const graphResult = await runAgentGraph(
            cleanedInput,
            buildSystemPrompt(),
            onToolCall,
            onStatus ?? (() => {}),
            decision,
            onStageEvent        // ← add this
        );

        if (graphResult.escalated && onEscalation) {
            onEscalation({
                userMessage: graphResult.userMessage,
                plan:        graphResult.plan,
                trajectory:  graphResult.trajectory,
                finalOutput: graphResult.finalOutput ?? '',
            });
        }

        if (graphResult.finalOutput) {
            sessionMessages.push(new AIMessage(graphResult.finalOutput));
            saveSession(sessionMessages);
            return graphResult.finalOutput;
        }
    }



    const simpleAgent = createReactAgent({
        llm: createLlm(decision.recommendedModel),
        tools,
        stateModifier: new SystemMessage(systemPrompt)
    })

    const trimmed = trimHistory(sessionMessages);
    const eventStrem = simpleAgent.streamEvents({messages: trimmed}, {version: 'v2'});

    let finalResponse = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;


    for await (const {event, data,name:eventName} of eventStrem){
        if(event === 'on_chat_model_stream'){
            const chunk = data.chunk;
            let token = '';

            if(typeof chunk?.content === 'string'){
                token = chunk.content;
            }else if(Array.isArray(chunk?.content)){
                token=chunk.content.filter((c: any) => c.type === 'text').map((c:any)=> c.text ?? '').join('');
            }


            if (token){
                onToken?.(token);
                finalResponse += token;
            }

            // const token = data.chunk?.content;
            // if(token && typeof token === 'string'){
            //     onToken?.(token);
            //     finalResponse += token;
            // }
        }

        if(event === 'on_tool_start'){
            onToolCall(eventName, data.input);
        }

        if(event === 'on_chat_model_end'){
            const usage = data.output?.usage_metadata;
            if (usage) {
                totalInputTokens  += usage.input_tokens  ?? 0;
                totalOutputTokens += usage.output_tokens ?? 0;
            }
            if(!finalResponse){
                const output = data.output;
                if(typeof output?.content === 'string'){
                    finalResponse = output.content;
                    onToken?.(finalResponse);
                }
            }
        }
    }


    if(finalResponse){
        sessionMessages.push(new AIMessage(finalResponse));
    }

    if (onUsage && (totalInputTokens + totalOutputTokens) > 0) {
        const model = decision.recommendedModel;
        onUsage(
            totalInputTokens + totalOutputTokens,
            estimateCost(model, totalInputTokens, totalOutputTokens)
        );
    }

    saveSession(sessionMessages);
    return finalResponse;

    
}





