import { makeLlm } from '../llm/factory.js';
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export async function explainResponse(response:string):Promise<string>{
    if(!response || response.length < 50) return '';
    const explainerLlm = makeLlm('meta-llama/Llama-3.3-70B-Instruct-Turbo');
    const result = await explainerLlm.invoke([
        new SystemMessage(`You are a friendly coding teacher.

Given what an AI coding assistant just did (described below), explain it in 2-4 simple sentences that a beginner would understand.

Focus on:
- WHAT changed and WHY
- WHICH concept was used (e.g., "promise chaining", "dependency injection")
- ONE thing to learn next

Tone: encouraging, plain language, define any jargon used.`),

                new HumanMessage(`What was just done:\n${response}`)
    ]);
    return result.content as string;
}
