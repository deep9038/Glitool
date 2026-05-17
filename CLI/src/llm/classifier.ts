import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage,HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { TaskDomain } from "./router.js";

const VALID_DOMAINS: TaskDomain[] = [
    'chat', 'coding', 'explanation','planning', 'debugging', 'refactoring', 'review', 'git'
]


const classifierLlm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    modelKwargs: {
        response_format: { type: 'json_object' },
    }
})




export interface ClassifierResult{
    domain: TaskDomain;
    confidence: 'high' | 'low';
    reason: string;
    tokens: number;
}


export async function classifyWithLlm(prompt: string,recentMessages:BaseMessage[]):Promise<ClassifierResult | null>{
    try{
        const history = recentMessages.slice(-6).map(m => {
            const role = m._getType() === 'human' ? 'User' : 'Assistant';
            const text = ( typeof m.content === 'string' ? m.content : '' ).slice(0, 300);
            return `${role}: ${text}`;
        }).join('\n').slice(0,1000);

        const response = await classifierLlm.invoke([
            new SystemMessage(`You are a routing classifier for a coding assistant CLI.
Classify the user's message into exactly ONE domain. Use the conversation history to resolve pronouns and references.

CRITICAL: Classify by the user's INTENT, not by words appearing in file paths or identifiers. A file named "git-agent.ts" being mentioned does NOT make the request a git task. "agent" in a path does NOT mean coding. Look at the verb and what the user wants to happen.

Domains:
- chat: greetings, opinions, casual questions with no file or code operation needed. Examples: "hi", "thanks", "what do you think about X".
- explanation: the user wants to UNDERSTAND something that already exists. Reading a file, summarizing code, explaining what a function does. Examples: "read router.ts", "what does this function do", "show me package.json", "how does auth work here".
- coding: the user wants to CREATE or MODIFY code to add functionality. New features, new files, new logic. Examples: "build a todo CLI", "add a login route", "implement caching".
- debugging: the user has an ERROR, crash, failing test, or broken behavior they want fixed. Examples: "fix this crash", "tests are failing", "why does X throw".
- refactoring: the user wants STRUCTURAL change with identical behavior. Rename, extract, dedupe, simplify. Examples: "clean up router.ts", "extract this into a helper", "rename X to Y".
- review: the user wants a READ-ONLY audit or quality assessment. Examples: "review my router", "any security issues here", "is this code good".
- planning: the user wants a DESIGN DOCUMENT or roadmap written to plan.md. Examples: "plan a payment system", "design the auth flow", "roadmap for v2".
- git: ONLY for actual git/version-control operations — commit, diff, push, pull, branch, log, status, stash. Reading source files via paths like "src/foo.ts" is NEVER git, even when the filename contains the word "git". Examples: "commit my changes", "what's on this branch", "write a commit message".

Tie-breakers:
- "read/show/open/cat/view <path>" → explanation
- "fix <error>" → debugging
- "add/build/create <feature>" → coding
- "clean up/refactor/rename <code>" → refactoring
- "review/audit/check <code>" → review
- "plan/design/roadmap <thing>" → planning
- starts with the literal word "git" → git
- short greeting or opinion question → chat

Return JSON: {"domain":"<domain>","confidence":"high" or "low", "reason":"<one sentence>"}`),

        new HumanMessage(history ? `Conversation so far:\n${history}\n\nNew message: ${prompt}` : `Message: ${prompt}`)], { timeout: 3000 });


        const raw = typeof response.content === 'string' ? response.content : '';

        const parsed = JSON.parse(raw);

        if (!VALID_DOMAINS.includes(parsed.domain)) return null;


        return {
            domain: parsed.domain as TaskDomain,
            confidence: parsed.confidence === 'high' ? 'high' : 'low',
            reason: parsed.reason ?? '',
            tokens: (response as any).usage_metadata?.total_tokens ?? 0,
        };
    } catch {
        return null
    }
}


