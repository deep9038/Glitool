import fs from 'fs';
import path from 'path';
import { HumanMessage,AIMessage,SystemMessage,BaseMessage } from '@langchain/core/messages';




const MEMORY_PATH = path.join(process.cwd(),'.glitool','memory.json');

export type ProjectMemory = {
    techStack: string[];
    architectureDecisions: string[];
    todos:string[];
    lastUpdated:string;
}


export function loadProjectMemory(): ProjectMemory | null{
    try{
        if (!fs.existsSync(MEMORY_PATH)) return null;
        return JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf-8'));
    }catch{
        return null;
    }
}


export function saveProjectMemory(memory: ProjectMemory): void {
    try {
        fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
        fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');
    } catch {}
}


export async function extractAndSaveProjectMemory(messages: BaseMessage[],llm:any):Promise<void>{
    const readable = messages
            .filter(m => m instanceof HumanMessage || (m instanceof AIMessage && m.content))
            .slice(-20)
            .map(m => `${m instanceof HumanMessage ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n');

    if (!readable.trim()) return;

    const existing = loadProjectMemory();

    const response = await llm.invoke([
        new SystemMessage(`Extract structured project facts from this conversation. return valid JSON only:
            {
            "techStack": ["languages, frameworks, libraries mentioned"],
            "architectureDecisions": ["key structural decisions made"],
            "todos": ["next steps or TODOs mentioned"],
            "lastUpdated": "${new Date().toISOString()}"
            }
            
            ${existing ? `Merge with existing memory: ${JSON.stringify(existing)}`:''}`),
            new HumanMessage(readable)
    ]);
    try{
        const cleaned = (response.content as string).replace(/```json|```/g,'').trim();
        saveProjectMemory(JSON.parse(cleaned));
    } catch {}
}



export function clearProjectMemory(): void{
    try{
        if (fs.existsSync(MEMORY_PATH)) fs.unlinkSync(MEMORY_PATH);
    } catch {}
}

