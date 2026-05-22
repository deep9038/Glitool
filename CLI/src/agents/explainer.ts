import { makeLlm } from '../llm/factory.js';
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const explainerLlm = makeLlm('meta-llama/Llama-3.3-70B-Instruct-Turbo');


export async function explainResponse(response:string):Promise<string>{
    if(!response || response.length < 50) return '';
    const result = await explainerLlm.invoke([
        new SystemMessage(`You are a coding teacher. Give what an AI coding assistant just did, explain it in 2-4 simple sentences a biginner would underStand.     
            Focus on:
            - What changed and why
            - What concept was used
            - What to learn next
            Keep it friendly and short.`),
                new HumanMessage(`What was just done:\n${response}`)
    ]);
    return result.content as string;
}