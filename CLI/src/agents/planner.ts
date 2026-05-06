import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";


const plannerLlm = new ChatOpenAI({
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY
});


export async function runPlanner(userMessage: string, context: string): Promise<string> {
    const response = await plannerLlm.invoke([
        new SystemMessage(`You are a coding task planner. Given a user request, output a clear numbered plan.
Rules:
- Be specific about which files to read, edit, or create
- Do NOT write any code — only plan the steps
- Keep it to 3-6 steps maximum
- If the task is ONLY a question or explanation with NO file creation or code execution needed, output exactly: SIMPLE
- Any task that requires creating, editing, or writing files must NEVER be SIMPLE
`),
        new HumanMessage(`Context:\n${context}\n\nUser request: ${userMessage}`)
    ]);

    return response.content as string;
}