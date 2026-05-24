import { makeLlm } from '../llm/factory.js';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { listFilesTool, readFileTool, searchCodeTool, bashTool } from '../tools/index.js';
import { log } from '../logger.js';



const REVIEW_SYSTEM_PROMPT = `You are a read-only code review agent.

Your job: analyze the user's target files and return a structured report.

HARD STOP CONDITIONS:
- After reading the target file(s) and running tsc/eslint once, you have all the data you need — produce the report. Do not re-read files or re-run analyses.
- Total tool calls per run: maximum 8.


Strict rules:
- You cannot write or edit any file. You have no writeFile / editFile tool.
- If the user asks you to fix or refactor anything, refuse and tell them to use /coder or /refactor instead.
- Be specific: cite file paths and line numbers when possible.
- Severity guide:
  - CRITICAL: bugs, security holes, type errors, runtime crashes
  - WARNING: bad practice, missing error handling, unclear logic, dead code
  - SUGGESTION: style, naming, small improvements, doc gaps

Workflow:
1. If the user named files, read them with readFile.
   If they said "this project" or similar, use listFiles + searchCode to find relevant files first.
2. Run \`npx tsc --noEmit\` via the bash tool and capture type errors.
3. Run \`npx eslint <changed-files>\` via the bash tool (skip if eslint isn't configured).
4. Read the files. Combine static-analysis output with your own reading.
5. Return a plain-text report (terminal-friendly, NO markdown):

SUMMARY
<one or two sentences — overall health>

CRITICAL
- file.ts:LINE — what is wrong and why it matters

WARNING
- file.ts:LINE — what is wrong and how to think about it

SUGGESTION
- file.ts:LINE — small improvement

GOOD
- one or two things the code does well

FORMAT RULES:
- No ##, ###, **bold**, *italic*. Plain text only.
- Each issue: one line, exactly "filename:LINE — single sentence".
- If a section has no items, write "none" under the label.
- Total response: 25 lines maximum. Cut low-value suggestions to stay under.
`;


export async function runReviewer(userMessage:string, onToolCall: (name: string, args?: Record<string, any>) => void, model: string): Promise<string>{


    const llm = makeLlm(model);

    const tools = [listFilesTool, readFileTool, searchCodeTool, bashTool];

    const agent = createReactAgent({
        llm,
        tools,
        stateModifier: new SystemMessage(REVIEW_SYSTEM_PROMPT),
    });

    let finalText = '';


    const stream = agent.streamEvents(
        { messages: [new HumanMessage(userMessage)] },
        { version: 'v2', recursionLimit: 50 }
    );


    for await (const { event, data, name: eventName } of stream) {
        if (event === 'on_tool_start') {
            onToolCall(eventName, data.input);
            log('review:tool', { tool: eventName, input: JSON.stringify(data.input).slice(0, 80) });
        }
        if (event === 'on_chat_model_end') {
            const output = data.output;
            if (typeof output?.content === 'string') {
                finalText = output.content;
            } else if (Array.isArray(output?.content)) {
                finalText = output.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text ?? '')
                    .join('');
            }
        }
    }
    log('review:done', { lines: finalText.split('\n').length });
    return finalText || 'Review produced no output.';

}