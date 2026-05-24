import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { BaseMessage,HumanMessage,SystemMessage,AIMessage,ToolMessage } from '@langchain/core/messages';


const SESSIONS_DIR = path.join(os.homedir(),'.glitool','sessions');
const SUMMARY_SUFFIX = '.summary.md'
const MAX_SAVED_MESSAGES = 40;

function getSessionPath(): string{
    const projectHash = crypto.createHash('md5').update(process.cwd()).digest('hex').slice(0,8);
    return path.join(SESSIONS_DIR,`${projectHash}.json`);
}


type SerializedMessage = { type: string; content: string; tool_call_id?: string };


function serialize(messages:BaseMessage[]): SerializedMessage[]{
    return messages.filter(m => {
        if(m instanceof ToolMessage) return false;
        if (m instanceof AIMessage && !m.content) return false;
        return true;
    })
    .map(m => {
        if (m instanceof HumanMessage) return {type: 'human', content: m.content as string };
        if (m instanceof AIMessage) return { type: 'ai', content: m.content as string };
        return {type: 'system', content: m.content as string}
    })
}



function deserialize(data: SerializedMessage[]):BaseMessage[]{
    return data.map(m=>{
        if (m.type === 'human') return new HumanMessage(m.content);
        if (m.type === 'ai') return new AIMessage(m.content);
        if (m.type === 'tool') return new ToolMessage({content:m.content,tool_call_id:m.tool_call_id ?? '' })
        return new SystemMessage(m.content);
    });
}


export function loadSession(): BaseMessage[]{
    try{
        const file = getSessionPath();
        if (!fs.existsSync(file)) return[];
        const data =JSON.parse(fs.readFileSync(file,'utf-8')) as SerializedMessage[];
        return deserialize(data);
    }catch{
        return [];
    }
}



export function saveSession(messages:BaseMessage[]): void {
    try{
        fs.mkdirSync(SESSIONS_DIR,{recursive:true})
        const trimmed = messages.slice(-MAX_SAVED_MESSAGES);
        fs.writeFileSync(getSessionPath(),JSON.stringify(serialize(trimmed),null,2), 'utf-8')
    }catch{
        //no-critical
    }
}


export function loadSummary(): string | null {
    try{
        const hash = crypto.createHash('md5').update(process.cwd()).digest('hex').slice(0,8);
        const file = path.join(SESSIONS_DIR, `${hash}${SUMMARY_SUFFIX}`);
        if(!fs.existsSync(file)) return null;
        return fs.readFileSync(file,'utf-8');
    }catch{
        return null;
    }
}


export async function generateAndSaveSummary(messages: BaseMessage[], llm:any): Promise<void>{
    const readable = messages
        .filter(m => m instanceof HumanMessage || (m instanceof AIMessage && m.content))
        .map(m => `${m instanceof HumanMessage ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
    if (!readable.trim()) return;
    const response  = await llm.invoke([
        new SystemMessage(`You're writing a brief for the next coding session. The user will return to this project days or weeks later and need fast context recall.

In 2-3 sentences, summarize:
- What was built or changed (be specific: file paths, function names)
- Key decisions made (e.g., "chose JWT over sessions", "Postgres over Mongo")
- Likely next step

Avoid generic phrases like "we worked on the project". Cite specifics.`),

        new HumanMessage(readable)
    ])
    const hash = crypto.createHash('md5').update(process.cwd()).digest('hex').slice(0,8);
    const file = path.join(SESSIONS_DIR, `${hash}${SUMMARY_SUFFIX}`);
    fs.mkdirSync(SESSIONS_DIR,{recursive:true});
    fs.writeFileSync(file,response.content as string, 'utf-8');
}



export function clearSummary(): void{
    try{
        const hash = crypto.createHash('md5').update(process.cwd()).digest('hex').slice(0,8);
        const file = path.join(SESSIONS_DIR, `${hash}.summary.md`);
        if (fs.existsSync(file)) fs.unlinkSync(file);
    }catch{}
}



 