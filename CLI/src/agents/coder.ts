import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage,BaseMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { listFilesTool, readFileTool, searchCodeTool, editFileTool, writeFileTool } from '../tools/index.js';
import { scoreRisk,getRiskMessage } from "../trust/riskScorer.js";
import { requestConfirm } from "../confirmHandler.js";
const coderLlm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
})



const coderAgent = createReactAgent({
    llm:coderLlm,
    tools: [listFilesTool,readFileTool,searchCodeTool,editFileTool,writeFileTool] as StructuredTool[],
    stateModifier:new SystemMessage('You are a coding execution agent. Execute the given plan step by step using tools. Be precise and thorough.')
});


export async function runCoder(plan: string,userMessage: string,onToolCall: (name:string,args?:Record<string, any>)=> void): Promise<string>{
    const stream = await coderAgent.stream({
        messages: [new HumanMessage(`Plan to execute:\n${plan}\n\nOriginal request: ${userMessage}`)]
    })

    let result ='';

    for await(const chunk of stream){
        if (chunk.agent?.messages){
            const msgs = chunk.agent.messages as BaseMessage[];
            const msg = msgs.at(-1);
            if((msg as any)?.tool_calls?.length >0){
                const toolCall = (msg as any).tool_calls[0];
                const risk = scoreRisk(toolCall.name,toolCall.args);
                const riskMsg = getRiskMessage(toolCall.name,risk,toolCall.args);


                if(risk === 'high'){
                    onToolCall(toolCall.name,toolCall.args);
                    result = `Blocked: I cannot write to sensitive files like ${toolCall.args?.filePath}.`;
                    break;
                }
                onToolCall(toolCall.name,toolCall.args);
            }else if(msg?.content){
                result = msg.content as string;
            }
        }
    }




    // for await (const chunk of stream){
    //     if(chunk.agent?.messages){
    //         const msgs = chunk.agent.messages as BaseMessage[];
    //         const msg = msgs.at(-1);

    //         if((msg as any)?.tool_calls?.length > 0){
    //             onToolCall((msg as any).tool_calls[0].name, (msg as any).tool_calls[0].args);
    //         }else if (msg?.content){
    //             result = msg.content as string;
    //         }
    //     }
    // }
    return result;
}
