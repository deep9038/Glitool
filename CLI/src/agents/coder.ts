// REPLACE the whole file with:
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { listFilesTool, readFileTool, searchCodeTool, editFileTool, writeFileTool,bashTool  } from '../tools/index.js';
import { scoreRisk, getRiskMessage } from "../trust/riskScorer.js";
import { log } from "../logger.js";

export async function runCoder(
    plan: string,
    userMessage: string,
    onToolCall: (name: string, args?: Record<string, any>) => void,
    model: string
): Promise<string> {
    
    const coderLlm = new ChatOpenAI({ 
        model, 
        apiKey: process.env.OPENAI_API_KEY,
        modelKwargs: { parallel_tool_calls: false }
    });

    const coderAgent = createReactAgent({
        llm: coderLlm,
        tools: [listFilesTool, readFileTool, searchCodeTool, editFileTool, writeFileTool,bashTool] as StructuredTool[],
        stateModifier: new SystemMessage(`You are a coding execution agent. Execute the given plan step by step using tools.

GROUNDING RULES — these are not optional:

1. BEFORE editing any file, READ it first with readFile to confirm structure.
2. PREFER searchCode over readFile for navigation. Read whole files only when you'll actually edit them.
3. For UI features (slash commands, menus, palettes), search src/ui/, src/components/, src/cli/ first — don't trust the plan's filename blindly.
4. After every editFile, if the tool returned an error, STOP and read the file again. Do not retry with guesses.
5. You MAY create package.json or tsconfig.json when building a new project from scratch. Never add dependencies to an EXISTING package.json unless explicitly asked. Never run npm install via bash.
6. Maximum 5 file reads per task. If you need more, you're doing it wrong — use searchCode instead.
7. If you can't safely complete the task, STOP and return a failure message. Do not invent.

Be surgical, not exhaustive. Most tasks need 2-4 tool calls, not 15. The validator will catch broken output — you don't need to over-verify.`)

    });

    const stream = await coderAgent.stream(
        { messages: [new HumanMessage(`Plan to execute:\n${plan}\n\nOriginal request: ${userMessage}`)] },
        { recursionLimit: 30 }
    );


    let result = '';

    for await (const chunk of stream) {
        if (chunk.agent?.messages) {
            const msgs = chunk.agent.messages as BaseMessage[];
            const msg = msgs.at(-1);
            if ((msg as any)?.tool_calls?.length > 0) {
                const toolCall = (msg as any).tool_calls[0];
                const risk = scoreRisk(toolCall.name, toolCall.args);
                getRiskMessage(toolCall.name, risk, toolCall.args);

                if (risk === 'high') {
                    onToolCall(toolCall.name, toolCall.args);
                    result = `Blocked: I cannot write to sensitive files like ${toolCall.args?.filePath}.`;
                    break;
                }
                onToolCall(toolCall.name, toolCall.args);
            } else if (msg?.content) {
                result = msg.content as string;
            }
        }
        log('coder:chunk', { hasAgent: !!chunk.agent, hasTools: !!chunk.tools });
    }
    return result;
}
