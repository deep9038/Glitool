import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { BaseMessage,HumanMessage,SystemMessage,AIMessage,ToolMessage } from '@langchain/core/messages';
import { COMPACT_AT, type Plan } from './llm/budgets.js';


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


const COMPACT_KEEP_RECENT = 12;
const COMPACT_MARKER      = '## Compacted earlier conversation';

function messageCharCount(messages: BaseMessage[]): number {
    let total = 0;
    for (const m of messages) {
        total += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
    }
    return total;
}

/**
 * If the conversation has grown large, summarize the older portion into a single
 * SystemMessage and return a new array with [summary, ...recent]. Otherwise return
 * the input unchanged. Idempotent — if a compaction summary is already present at the
 * start, it's left in place and only newer content is folded in.
 *
 * Threshold is tier-aware: anon compacts earliest, pro compacts latest.
 *
 * Returns the original array on any failure (we never lose data).
 */
export async function compactOldMessages(
    messages: BaseMessage[],
    llm: any,
    plan: Plan = 'anon',
): Promise<BaseMessage[]> {
    const threshold = COMPACT_AT[plan];
    if (messageCharCount(messages) < threshold) return messages;
    // Need at least one message older than KEEP_RECENT to have something to summarize.
    // Earlier we required +4 buffer, but that lets large early pastes slip through.
    if (messages.length <= COMPACT_KEEP_RECENT) return messages;

    const recent = messages.slice(-COMPACT_KEEP_RECENT);
    const old    = messages.slice(0, -COMPACT_KEEP_RECENT);

    const readable = old
        .filter(m => m instanceof HumanMessage || (m instanceof AIMessage && m.content))
        .map(m => `${m instanceof HumanMessage ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

    if (!readable.trim()) return messages;

    try {
        const response = await llm.invoke([
            new SystemMessage(`You compress conversations so a future LLM can pick up the thread without seeing the originals.

Output 5-10 dense bullet points covering:
- What was built or changed (cite file paths, function names, commands run)
- Decisions made and why (e.g. "chose JWT over sessions because…")
- Errors hit and their fixes
- Open threads / next steps the user mentioned

Be specific. Do not say "we discussed X" — say what was decided. Output ONLY bullets, no preamble.`),
            new HumanMessage(readable),
        ]);
        const summary = new SystemMessage(`${COMPACT_MARKER}\n${response.content as string}`);
        return [summary, ...recent];
    } catch {
        return messages;
    }
}



 