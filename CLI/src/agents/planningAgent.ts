import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { existsSync,readFileSync,writeFileSync } from "fs";
import { join } from "path";



const PLAN_FILE = "plan.md";
const BLOCKED_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.json', '.py', '.go', '.rs'];


export async function runPlanningAgent(userMessage:string):Promise<string>{
    const llm = new ChatOpenAI({model: 'gpt-4o',apiKey: process.env.OPENAI_API_KEY});
    const planPath = join(process.cwd(),PLAN_FILE);
    const existingPlan = existsSync(planPath) ? readFileSync(planPath,'utf-8') : null;
    const systemPrompt = existingPlan ? ` You are a planning assistant. The user has an existing plan - uodate it based on their request.
Rules:
- Return the COMPLETE updated plan, not just the changes
- Use markdown with clear sections and numbered steps
- Be specific: name files, components, decisions, trade-offs
- After the plan, write exactly "---" on its own line, then 1-3 bullet points summarising what you changed`
    : `You are a  planning assistant. Create a clear structured plan based on user's request.
Rules:
- Use Markdown with clear sections and numbered steps
- Be specific: name files, components, decisions, trade-offs
- If the request is vague, make reasonable assumptions and state them in the plan
- After the plan, write exactly "---" on its own line, then 1-3 bullet points summarising what you created`
    
    const userContent = existingPlan ? `Current plan:\n\n${existingPlan}\n\nUser request:${userMessage}`:userMessage;
    const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userContent)
    ]);
    const content = response.content as string;
    const splitIndex = content.lastIndexOf('\n---\n');
    const planBody = splitIndex !== -1 ? content.slice(0, splitIndex).trim() : content.trim();
    const changeSummary = splitIndex !== -1 ? content.slice(splitIndex + 5).trim() : 'Plan saved.';
    if ( BLOCKED_EXTENSIONS.some(ext => planBody.includes('```' + ext.slice(1)))){
        return 'Planning agent only writes markdown plans, not source code. Use /coder for coding tasks.';
    }
    writeFileSync(planPath,planBody,'utf-8');
    const action = existingPlan ? 'updated' : 'created';
    return `**plan.md ${action}**\n\n${changeSummary}`;
}