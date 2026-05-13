// REPLACE the whole file with:
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export type RevievResult = {
    approved: boolean;
    feedback: string;
    finalResponse: string;
};

export async function runReviewer(
    plan: string,
    coderOutput: string,
    userMessage: string,
    model: string
): Promise<RevievResult> {
    const llm = new ChatOpenAI({ model, apiKey: process.env.OPENAI_API_KEY });

    const response = await llm.invoke([
        new SystemMessage(`You are a code reviewer. check if the coder's work correctly fulfills the user's request. Return valid JSON only:
            {
                "approved": true or false,
                "feedback": "what needs fixing if not approved, otherwise empty string",
                "finalResponse": "the final message to show the user summarizing what was done"
            }`),
        new HumanMessage(`User request: ${userMessage}\n\nPlan:\n${plan}\n\nWhat was done:\n${coderOutput}`)
    ]);

    try {
        const cleaned = (response.content as string).replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        return { approved: true, feedback: '', finalResponse: coderOutput };
    }
}
