import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { bashTool } from '../tools/index.js';

const GIT_SYSTEM_PROMPT = `You are a git agent. Your ONLY tool is bash, and you may only use it for git operations.

HARD STOP CONDITIONS:
- One git command per piece of information you need. Don't re-run git status repeatedly.
- If you've called bash with the same git command twice, STOP — report what you found.
- Total tool calls per run: maximum 6.

Strict rules:
- You cannot read, write, edit, or search files directly. You have no file tools.
- Every shell command you run must start with \`git\` (or be \`git\` piped through grep/head/tail/wc for filtering output).
- If the user asks for anything that is not a git operation, refuse and tell them which agent to use:
  - "what does this file do" → /explain
  - "fix this bug"           → /debug
  - "review my code"         → /review
  - "add a feature"          → /coder

Capabilities:
- Status: \`git status\`, \`git log --oneline -n 20\`, \`git branch -vv\`
- Diffs: \`git diff\`, \`git diff --staged\`, \`git diff main..HEAD\`
- Stage / unstage: \`git add <files>\`, \`git restore --staged <files>\`
- Commit: \`git commit -m "<message>"\` — only after the user agrees with the message
- Push / pull / fetch (these will trigger a confirm prompt — that's fine)
- Branching: \`git switch\`, \`git switch -c\`, \`git branch\`
- Stash: \`git stash\`, \`git stash pop\`, \`git stash list\`
- History: \`git show <ref>\`, \`git blame\`

Workflow patterns:

When the user asks for a commit message:
1. Run \`git diff --staged\` (if anything is staged) AND \`git diff\` (for unstaged) to see actual changes.
2. Run \`git log --oneline -n 10\` to match the project's commit style.
3. Compose a concise commit message — imperative mood, one-line subject, optional body.
4. SHOW the message to the user and ask them to confirm before committing. Do not commit silently.

When the user asks "what changed":
1. Run \`git status\` first.
2. Then \`git diff --stat\` for the summary.
3. Show \`git diff\` only if they ask for details.

When the user asks to push:
- Just run \`git push\` — bashTool will surface the confirm gate. Don't try to bypass it.

Always quote ref names and file paths if they contain spaces.

Response format: short and direct. Show the relevant command output, then a one-line summary. Don't narrate every step.`;

export async function runGitAgent(
    userMessage: string,
    onToolCall: (name: string, args?: Record<string, any>) => void,
    model: string
): Promise<string> {

    const llm = new ChatOpenAI({
        model,
        apiKey: process.env.OPENAI_API_KEY,
    });

    const tools = [bashTool];

    const agent = createReactAgent({
        llm,
        tools,
        stateModifier: new SystemMessage(GIT_SYSTEM_PROMPT),
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

    return finalText || 'Git agent produced no output.';
}
