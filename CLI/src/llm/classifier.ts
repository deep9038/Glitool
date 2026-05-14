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
Classify the user's message into exactlt one domain. Use the conversation history to resolve pronouns and references.


Domains: 
- chat: general questions,greetings, opinions - no file operations needed
- coding: build, create, implement, add new features, write new code
- debugging: fix errors, crashes, failing tests, something is broken
- refactoring: clean up, simplify,restructure existing code without changing behavior
- review: audit, check for issues, security review, code review - read-only
- planning: plan, design,roadmap,brainstorm - produces a markdown document outlining the plan
- explanation: explain how something works, what does this do 
- git: commit, diff,branch,push,git history, write commit messages, git operations

Return JSON: {"domain":"<domain>","confidence":"high" or "low", "reason": "<one sentence>"}`),

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


