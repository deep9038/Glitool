import {  writeFileTool, analyzeProjectTool, listFilesTool, readFileTool, searchCodeTool,editFileTool   } from "./tools/index.js";
import { AIMessage, BaseMessage,HumanMessage,SystemMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { loadSession,loadSummary,saveSession,generateAndSaveSummary  } from "./memory.js";
import { loadConfig } from "./config.js";
import { loadProjectMemory } from "./projectMemory.js";
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { detectComplexity } from './llm/router.js';
import { runAgentGraph } from "./agents/graph.js";
import os from 'os';
  

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: join(os.homedir(), '.glitool', '.env') });



const simpleLlm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
});



export const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
});




const config = loadConfig();



const tools: StructuredTool[] = [listFilesTool, readFileTool, searchCodeTool, writeFileTool, analyzeProjectTool, editFileTool];
export const sessionMessages: BaseMessage[] = loadSession()


export function clearSession(): void {
    sessionMessages.length = 0;
    saveSession(sessionMessages);
}



function buildSystemPrompt(): string{
    let summary = loadSummary();
    const project = loadProjectMemory(); 

    if(!summary) {
        const rawSession = loadSession();
        if(rawSession.length > 4){
            generateAndSaveSummary(rawSession,llm);
            summary = loadSummary();
        }
    }


    // const project = loadProjectMemory();

    let prompt =  `You are an expert coding assistant. Be concise and code-focused.
IMPORTANT: If any tool returns USER_CANCELLED, immediately stop all tool calls and tell the user the operation was cancelled. Never retry a cancelled operation.`
    if (summary) prompt += `\n\nPrevious session summary:\n${summary}`;
    if (project) prompt += `\n\nProject facts:\n${JSON.stringify(project, null, 2)}`;
    return prompt;
}



const systemPrompt = await buildSystemPrompt();
const simpleAgent = createReactAgent({
    llm: simpleLlm,
    tools,
    stateModifier: new SystemMessage(buildSystemPrompt())
});


const complexAgent = createReactAgent({
    llm,
    tools,
    stateModifier: new SystemMessage(buildSystemPrompt())
});


















export async function chat(userInput: string, onToolCall: (name: string, args?: Record<string, any>) => void, onStatus?:(status:string)=> void, onToken?: (token: string) => void): Promise<string> {
    const complexity = detectComplexity(userInput);
    sessionMessages.push(new HumanMessage(userInput));

    if(complexity === 'complex'){
        const result = await runAgentGraph(userInput,buildSystemPrompt(),onToolCall,onStatus??(()=>{}))
        if(result !== null && result !== undefined){
            sessionMessages.push(new AIMessage(result));
            saveSession(sessionMessages);
            return result; 
        }
    };

    const eventStrem = simpleAgent.streamEvents(
        {messages: sessionMessages},
        {version: 'v2'}
    );

    let finalResponse = '';


    for await (const {event, data,name:eventName} of eventStrem){
        if(event === 'on_chat_model_stream'){
            const chunk = data.chunk;
            let token = '';

            if(typeof chunk?.content === 'string'){
                token = chunk.content;
            }else if(Array.isArray(chunk?.content)){
                token=chunk.content.filter((c: any) => c.type === 'text').map((c:any)=> c.text ?? '').join('');
            }


            if (token){
                onToken?.(token);
                finalResponse += token;
            }

            // const token = data.chunk?.content;
            // if(token && typeof token === 'string'){
            //     onToken?.(token);
            //     finalResponse += token;
            // }
        }

        if(event === 'on_tool_start'){
            onToolCall(eventName, data.input);
        }

        if(event === 'on_chat_model_end'){
            if(!finalResponse){
                const output = data.output;
                if(typeof output?.content === 'string'){
                    finalResponse = output.content;
                    onToken?.(finalResponse);
                }
            }
        }
    }


    if(finalResponse){
        sessionMessages.push(new AIMessage(finalResponse));
    }

    saveSession(sessionMessages);
    return finalResponse;
    
}





