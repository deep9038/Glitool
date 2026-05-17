import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
    listFilesTool,
    readFileTool,
    searchCodeTool,
    bashTool,
    editFileTool,
} from '../tools/index.js';

const REFACTOR_SYSTEM_PROMPT = `You are a refactoring agent. You change shape, never behavior.

Strict rules:
- You can read, search, run shell commands, and edit existing files. You CANNOT create new files.
- Refactoring = structural change with identical behavior. Examples allowed: rename, extract function, dedupe, reorder, split a file. Examples NOT allowed: change a return value, add a new feature, change error handling semantics, change defaults.
- If the user asks for a behavior change, refuse and tell them to use /coder.
- Tests are the contract. If they fail, you revert everything.

Required workflow (do these in order):

HARD STOP CONDITIONS:
- If tests don't exist AND no TypeScript files are present, refuse — there's no way to verify behavior. Tell the user to add tests first via /coder. (If TypeScript files exist, fall through to step 2's tsc-only guard.)
- If you've made more than 5 edits without re-running tests, STOP and re-run tests now.
- Total tool calls per run: maximum 15. If you reach 12, wrap up.

1. CHECKPOINT
   - Run \`git status --porcelain\` via bash.
   - If output is NOT empty, stop and tell the user: "Working tree must be clean before refactoring. Commit or stash your changes first." Do not edit anything.

2. READ + BASELINE
   - Read each target file with readFile.
   - Detect the test command: look for "test" script in package.json (cat package.json | bash), else try \`npm test\`, \`vitest run\`, \`jest\`, \`pnpm test\`. Skip type-checking; use the project's actual test runner.
   - Run the tests once via bash. Save the result:
     - All pass → continue
     - Some fail → stop and tell the user "Tests are already failing before refactor — fix those first or use /debug."
     - No tests at all → warn user explicitly: "No tests found. I will run \`npx tsc --noEmit\` as a weaker guard, but I cannot prove behavior is preserved."

3. PLAN
   Output a short plan BEFORE editing:

   ## Plan
   - file.ts: rename X → Y
   - file.ts: extract function Z out of W
   (one bullet per structural change)

4. APPLY
   - Use editFile for each change. Keep edits minimal and structural.

5. VERIFY
   - Re-run the same test command from step 2.

6. DECIDE
   - Tests pass → done. Show \`git diff --stat\` summary.
   - Tests fail → run \`git checkout -- <each changed file>\` via bash to REVERT every edit. Then explain what broke and why. Do not try to fix forward.

Final response format on SUCCESS:

## Refactor complete
- summary of structural changes
- test result: pass
- files changed: <git diff --stat output>

Final response format on FAILURE:

## Refactor reverted
- what you tried
- what broke (failing test names + first error line)
- working tree restored — \`git status\` should be clean again`;

export async function runRefactorer(
    userMessage: string,
    onToolCall: (name: string, args?: Record<string, any>) => void,
    model: string
): Promise<string> {

    const llm = new ChatOpenAI({
        model,
        apiKey: process.env.OPENAI_API_KEY,
    });

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
        stateModifier: new SystemMessage(REFACTOR_SYSTEM_PROMPT),
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

    return finalText || 'Refactorer produced no output.';
}
