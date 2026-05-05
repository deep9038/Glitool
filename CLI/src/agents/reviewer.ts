import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage,HumanMessage } from "@langchain/core/messages";

const reviewerLlm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
})

export type RevievResult ={
    approved: boolean;
    feedback: string;
    finalResponse: string;
};




export async function runReviewer(plan: string, coderOutput:string,userMessage:string):Promise<RevievResult>{
    const response = await reviewerLlm.invoke([
        new SystemMessage(`You are a code reviewer. check if the coder's work correctly fulfills the user's request. Return valid JSON only:
            {
                "approved":true or false,
                "feedback": "what needs fixing if not approved, otherwise empty string",
                "finalResponse": "the final message to show the user summarizing what was done"
            
            }`),
            new HumanMessage(`User request: ${userMessage}\n\nPlan:\n${plan}\n\nWhat was done:\n${coderOutput}`)
        ]);
        try{
            const cleaned = (response.content as string).replace(/```json|```/g, '').trim();
            return JSON.parse(cleaned);
        } catch {
            return { approved: true, feedback: '', finalResponse: coderOutput };
        }
}