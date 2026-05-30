import {  writeFileTool, listFilesTool, readFileTool, searchCodeTool,editFileTool,bashTool, readBackgroundOutputTool,webFetchTool,} from "./tools/index.js";
import { AIMessage, BaseMessage,HumanMessage,SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { loadSession,loadSummary,saveSession,generateAndSaveSummary  } from "./memory.js";
import { loadProjectMemory } from "./projectMemory.js";
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { route, stripExplicitPrefix } from './llm/router.js';
import { logRouting } from './llm/telemetry.js';
import os from 'os';
import { cleanupAll } from "./tools/processRegistry.js";
import type { ProcessEvent, StageKind } from './processEvents.js';
import { makeLlm, startNewRequest, getResolvedModelForCurrentRequest } from './llm/factory.js';
import { emit } from './monitor.js';
import { runClarifier } from './clarifier.js';
import { setClarificationHandler } from './clarificationHandler.js';
import { execSync } from 'child_process';
import { runExecutor } from "./agents/executor.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: join(os.homedir(), '.glitool', '.env') });

const MAX_HISTORY_CHARS = 60_000;

function createLlm(model: string): ChatOpenAI {
    return makeLlm(model);
}

/**
 * Lazy default LLM. Fresh instance each call so it picks up the
 * current request_id set by startNewRequest() at the top of chat().
 */
export function getDefaultLlm(): ChatOpenAI {
    return createLlm('meta-llama/Llama-3.3-70B-Instruct-Turbo');
}





const chatFallbackTools = [listFilesTool, readFileTool, searchCodeTool, writeFileTool, editFileTool, bashTool, readBackgroundOutputTool, webFetchTool];
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


function getGitContext(): string {
    try {
        const status = execSync('git --no-optional-locks status --short --branch', {
            cwd: process.cwd(),
            timeout: 3000,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).toString().trim();
        if (!status) return '';
        return `\n\n## Git State\n${status}`;
    } catch {
        return '';
    }
}




function buildSystemPrompt(): string {
    let summary = loadSummary();
    const project = loadProjectMemory();

    if (!summary) {
        const rawSession = loadSession();
        if (rawSession.length > 4) {
            generateAndSaveSummary(rawSession, getDefaultLlm()).catch(() => {});
            summary = loadSummary();
        }
    }

    let prompt = `You are Glitool — an AI coding assistant running in the user's terminal.

You can:
- Have a normal conversation (just respond, no tools needed)
- Answer programming and general questions
- Read, write, edit, and search files in the user's project
- Run shell commands, fetch web pages
- Plan, review, refactor, debug code, and help with git

Be concise. Default to plain conversation. Only call tools when the request clearly needs them.

For greetings or small talk (e.g. "hi", "hey", "thanks"), reply warmly in one short line and invite the user to say what they're working on. Don't ask them to clarify a "request" — there isn't one.

When the user asks to read, show, or display a specific file → call readFile.
For "read <name>" shorthand, pass the bare name; the tool searches the project automatically.
Don't claim a file is missing without verifying via listFiles or readFile first.

If any tool returns USER_CANCELLED, stop immediately and tell the user. Never retry a cancelled operation.

Style:
- No preamble like "Sure!", "Of course!", "I'd be happy to..."
- Code blocks use language tags: \`\`\`ts, \`\`\`py, \`\`\`bash
- File references use backticks: \`src/auth.ts:42\`
- The user's current working directory IS the project they're working on — file paths are relative to it.
`;

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

    const gitContext = getGitContext();
    if (gitContext) prompt += gitContext;


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

// Keyed by the model the SERVER actually runs, not the CLI's role hint.
// Together.ai pricing per million tokens (May 2026).
const COST_PER_TOKEN: Record<string, { input: number; output: number }> = {
    'MiniMaxAI/MiniMax-M2.7':            { input: 0.30 / 1_000_000, output: 1.20 / 1_000_000 },
    'deepseek-ai/DeepSeek-V4-Pro':       { input: 2.10 / 1_000_000, output: 4.40 / 1_000_000 },
    'moonshotai/Kimi-K2.6':              { input: 1.20 / 1_000_000, output: 4.50 / 1_000_000 },
    'Qwen/Qwen2.5-7B-Instruct-Turbo':    { input: 0.30 / 1_000_000, output: 0.30 / 1_000_000 },
};


function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const rates = COST_PER_TOKEN[model] ?? COST_PER_TOKEN['MiniMaxAI/MiniMax-M2.7'];
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
    onUsage?: (tokens: number, cost: number) => void,
    onStageEvent?: (event: ProcessEvent) => void,
    onClarificationNeeded?: (question: string, options?: string[]) => Promise<string>,
): Promise<string> {
    startNewRequest();
    emit('user_prompt', { text: userInput });

    const decision = await route(userInput, sessionMessages.slice(-6));
    emit('router', { domain: decision.domain, tier: decision.tier, model: decision.recommendedModel, reason: decision.reason });

    logRouting(userInput, decision);
    const cleanedInput = decision.source === 'explicit' ? stripExplicitPrefix(userInput) : userInput;

    // Register the askUser tool callback so the executor can pause mid-execution and ask the user
    if (onClarificationNeeded) {
        setClarificationHandler(onClarificationNeeded);
    }

    // Fast codebase grep — no LLM, just gives the executor a head start
    const { codeContext } = await runClarifier(cleanedInput, decision.domain, sessionMessages.length);

    let finalInput = cleanedInput;
    if (codeContext) {
        finalInput = `${cleanedInput}\n\n[Codebase search context]:\n${codeContext}`;
    }
    emit('clarifier', { questions: [], skipped: true });


    emit('memory', {
        session_messages: sessionMessages.length,
        has_summary: !!loadSummary(),
        has_project: !!loadProjectMemory(),
        recent: sessionMessages.slice(-4).map(m => ({
            role: m._getType(),
            text: (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 150)
        }))
    });


    sessionMessages.push(new HumanMessage(cleanedInput));
    const shortcut = await tryDirectReadShortcut(cleanedInput, onToolCall);

    if (shortcut !== null) {
        sessionMessages.push(new AIMessage(shortcut));
        saveSession(sessionMessages);
        return shortcut;
    }


const EXECUTOR_DOMAINS = new Set([
    'coding', 'debugging', 'refactoring', 'git', 'planning', 'review'
]);

if (EXECUTOR_DOMAINS.has(decision.domain)) {
    emit('agent', { name: `executor:${decision.domain}` });
    onStageEvent?.({ type: 'stage_start', stage: decision.domain as StageKind });
    const result = await runExecutor(
        finalInput,
        decision.domain,
        decision.recommendedModel,
        (name, args) => {
            onStageEvent?.({ type: 'tool', stage: decision.domain as StageKind, tool: name, target: extractTarget(args) });
            onToolCall(name, args);
        },
        onStatus,
        trimHistory(sessionMessages),
    );
    onStageEvent?.({ type: 'stage_done', stage: decision.domain as StageKind });
    sessionMessages.push(new AIMessage(result));
    saveSession(sessionMessages);
    emit('response', { text: result });
    emit('done', { total_tokens: 0 });   // no token counting in executor path yet
    return result;

}



    emit('agent', { name: 'chat' });

    const chatTools = decision.domain === 'chat' ? [] : chatFallbackTools;

    const simpleAgent = createReactAgent({
        llm: createLlm(decision.recommendedModel),
        tools: chatTools,
        stateModifier: new SystemMessage(systemPrompt)
    })

    const trimmed = trimHistory(sessionMessages);
    emit('system_prompt', { agent: 'chat', text: systemPrompt.slice(0, 600) });

    const eventStrem = simpleAgent.streamEvents({messages: trimmed}, {version: 'v2'});

    let finalResponse = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let resolvedModel: string | null = null;


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

        }

        if(event === 'on_tool_start'){
            onToolCall(eventName, data.input);
            emit('tool_call', { name: eventName, input: data.input }); 
        }

        if (event === 'on_tool_end') {
            const out = typeof data.output === 'string'
                ? data.output
                : JSON.stringify(data.output ?? '');
            emit('tool_response', { name: eventName, output: out.slice(0, 1000) });
        }

        if (event === 'on_chat_model_end') {
            const usage = data.output?.usage_metadata;
            // Prefer the X-Glitool-Resolved-Model header (captured via fetch wrapper).
            // Falls back to LangChain's response_metadata.model_name, which on
            // ChatOpenAI reports the REQUEST hint (the role), not the resolved name.
            const fromHeader = getResolvedModelForCurrentRequest();
            const fromMeta = data.output?.response_metadata?.model_name as string | undefined;
            if (fromHeader) resolvedModel = fromHeader;
            else if (fromMeta) resolvedModel = fromMeta;

            if (usage) {
                totalInputTokens  += usage.input_tokens  ?? 0;
                totalOutputTokens += usage.output_tokens ?? 0;
                emit('llm_call', {
                    tokens_in: usage.input_tokens ?? 0,
                    tokens_out: usage.output_tokens ?? 0,
                    model: resolvedModel ?? decision.recommendedModel,
                });
            }
            const output = data.output;
            let msgText = '';
            if (typeof output?.content === 'string') {
                msgText = output.content;
            } else if (Array.isArray(output?.content)) {
                msgText = output.content.filter((c: any) => c.type === 'text').map((c: any) => c.text ?? '').join('');
            }
            if (msgText) {
                emit('llm_message', { text: msgText.slice(0, 800) });
                if (!finalResponse) { finalResponse = msgText; onToken?.(finalResponse); }
            }
        }

    }


    if(finalResponse){
        sessionMessages.push(new AIMessage(finalResponse));
    }

    if (onUsage && (totalInputTokens + totalOutputTokens) > 0) {
        const model = resolvedModel ?? decision.recommendedModel;
        onUsage(
            totalInputTokens + totalOutputTokens,
            estimateCost(model, totalInputTokens, totalOutputTokens)
        );
    }

    saveSession(sessionMessages);
    emit('response', { text: finalResponse });
    emit('done', { total_tokens: totalInputTokens + totalOutputTokens });

    return finalResponse;

    
}





