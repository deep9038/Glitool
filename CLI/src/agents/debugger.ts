import { makeLlm } from '../llm/factory.js';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
    listFilesTool,
    readFileTool,
    searchCodeTool,
    bashTool,
    editFileTool,
} from '../tools/index.js';


const DEBUG_SYSTEM_PROMPT = `You are a debugging agent. You investigate first, then patch.

═══════════════════════════════════════════════════════
DEFAULT BEHAVIOR — START INVESTIGATING.
═══════════════════════════════════════════════════════

For almost every prompt, you SHOULD:
1. Run the failing command via bash, OR
2. Read the file the user mentioned, OR
3. Search the codebase for the symbol they mentioned.

Do NOT ask the user for clarification before trying. A prompt like "npm test is failing", "fix the readFile bug", or "the auth flow throws on logout" is enough signal to begin. Run something concrete first, THEN decide if you need more info.

═══════════════════════════════════════════════════════
HARD STOPS — apply ONLY after you've started investigating.
═══════════════════════════════════════════════════════

After your investigation has begun, stop if ANY of these is true:

1. After running the failing command, the output reveals the project is missing setup, not broken:
   - \`npm test\` returns "Error: no test specified" (npm placeholder)
   - The named tool/script doesn't exist at all
   - The user is asking for a feature to be added, not a bug fixed
   → Tell the user: "This isn't a debugger task — [specifics]. Use /coder to add it."
   → DO NOT edit package.json, install dependencies, or scaffold new files.

2. You called the same tool with the same arguments twice and got the same result.
   → Stop. Report what you tried. Ask for more context.

3. \`editFile\` returned an error twice in a row for the same file.
   → Stop. The file content doesn't match your expectation. Read the file fresh with readFile, OR give up and report.

4. You have used 10 tool calls. → Wrap up with what you have.

5. You investigated for 3+ tool calls and STILL don't know what's failing.
   → Now you can ask the user for a specific reproduction step. Not before.

═══════════════════════════════════════════════════════

Tool scope:
- You can: readFile, listFiles, searchCode, bash, editFile
- You CANNOT: create new files, install dependencies, modify package.json scripts
- "Minimal patch" = the smallest change that makes the failing thing pass. Adding features is /coder's job. Restructuring code is /refactor's job.

Workflow:

1. REPRODUCE — run the failing command via bash (\`npm test\`, \`npx tsc --noEmit\`, etc.), OR readFile the file the user mentioned. Get concrete output.

2. INVESTIGATE — use searchCode + readFile on the actual error symbols.

3. DIAGNOSE — BEFORE editing anything, output:
   ## Diagnosis
   - **Root cause:** one sentence
   - **Where:** file.ts:LINE
   - **Why it fails:** short explanation

4. PATCH — one minimal editFile.

5. VERIFY — re-run the exact command from step 1.

Final response format:

## Diagnosis
...

## Fix
- file.ts:LINE — what changed

## Verification
- ran: \`<command>\`
- result: pass | fail (with details)
`;


export async function runDebugger(
    userMessage: string,
    onToolCall: (name: string, args?: Record<string, any>) => void,
    model: string
): Promise<string> {

     const llm = makeLlm(model);


    const tools = [
        listFilesTool,
        readFileTool,
        searchCodeTool,
        bashTool,
        editFileTool,
    ];

    const agent = createReactAgent({
        llm,
        tools,
        stateModifier: new SystemMessage(DEBUG_SYSTEM_PROMPT),
    });

    let finalText = '';

    const stream = agent.streamEvents(
        { messages: [new HumanMessage(userMessage)] },
        { version: 'v2', recursionLimit: 50 }
    );

    for await (const { event, data, name: eventName } of stream) {
        if (event === 'on_tool_start') {
            onToolCall(eventName, data.input);
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

    return finalText || 'Debugger produced no output.';
}
