import React, {useState,useRef} from "react";
import { Box,Text,  useApp, Static } from 'ink';
import TextInput from "ink-text-input";
import { chat, clearSession, llm, sessionMessages } from '../agent.js';
import { clearSummary, generateAndSaveSummary } from "../memory.js";
import { clearProjectMemory, extractAndSaveProjectMemory } from "../projectMemory.js";
import { useInput } from 'ink';
import { setConfirmHandler } from "../confirmHandler.js";
import { explainResponse } from "../agents/explainer.js";
import { loadConfig } from '../config.js';
import { Welcome } from './Welcome.js';
import { StatusBar } from './StatusBar.js';
import type { StatusState } from './StatusBar.js';
import { execSync } from 'child_process';

import { SlashPalette, filterCommands } from './SlashPalette.js';
import type { SlashCommand } from './SlashPalette.js';


import { ToolLog } from "./ToolLog.js";
import type { ToolEntry } from "./ToolLog.js";
import { Pipeline } from "./Pipeline.js";
import type { AgentState } from "./Pipeline.js";

import { ConfirmCard } from './ConfirmCard.js';
import type { ConfirmRequest } from '../confirmHandler.js';
import { ExplainCard } from "./ExplainCard.js";
import { colors } from "./tokens.js";
import { EscalationCard } from './EscalationCard.js';
import type { EscalationPayload, EscalationChoice } from './EscalationCard.js';
import { log } from "../logger.js";



type Message = {
    role: 'user' | 'assistant' | 'error' | 'explain';
    content: string;
};
type AppProps = { explainMode?: boolean };
// const previousInputRef = useRef('');
const config = loadConfig();


export const App = ({ explainMode = false }: AppProps) => {

    const { exit } = useApp();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const previousInputRef = useRef('');
    const ctrlVHandledRef  = useRef(false);
     // ← ADD HERE
    const [pastedContent, setPastedContent] = useState('');


    const [confirmResolver,setConfirmResolver] = useState<((v: boolean)=> void) | null>(null);
    
    const [streamingContent, setStreamingContent] = useState('');


    const [inputHistory, setInputHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const [statusState, setStatusState] = useState<StatusState>('idle');
    const [statusDetail, setStatusDetail] = useState<string>('');
    const [tokens, setTokens] = useState(0);
    const [cost, setCost] = useState(0);

    const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);



    const [toolLog, setToolLog] = useState<ToolEntry[]>([]);
    const [planner,  setPlanner]  = useState<AgentState>({ status: 'idle' });
    const [coder,    setCoder]    = useState<AgentState>({ status: 'idle' });
    const [workflow, setWorkflow] = useState<AgentState>({ status: 'idle' });
    const [validator, setValidator] = useState<AgentState>({ status: 'idle' });
    const [escalation, setEscalation] = useState<EscalationPayload | null>(null);
    const [judge, setJudge] = useState<AgentState>({ status: 'idle' });

    const [paletteIndex, setPaletteIndex] = useState(0);

    const paletteItems: SlashCommand[] = filterCommands(input);

const handleChange = (value: string) => {
    if (ctrlVHandledRef.current) {
        ctrlVHandledRef.current = false;
        return;
    }
    const previous = previousInputRef.current;
    const grew = value.length - previous.length;
    const grewALot = grew > 20;
    const newlineAppeared = /[\r\n]/.test(value) && !/[\r\n]/.test(previous);

    if (grewALot || newlineAppeared) {
        let pasted: string;
            if (value.startsWith(previous)) {
                pasted = value.slice(previous.length);
            } else if (value.endsWith(previous)) {
                pasted = value.slice(0, value.length - previous.length);
            } else if (previous && value.includes(previous)) {
                pasted = value.replace(previous, '');
            } else {
                pasted = value;
            }

            if (pasted.includes('\n')) {
                // multi-line → clipping section
                setPastedContent(prev => (prev ? `${prev}\n\n${pasted}` : pasted));
                setInput(previous);
                previousInputRef.current = previous;
            } else {
                // single line → stays in input field
                setInput(value);
                previousInputRef.current = value;
            }
    } else {
        setInput(value);
        previousInputRef.current = value;
    }
    setPaletteIndex(0);
};



    const handleExit = async () => {
        await generateAndSaveSummary(sessionMessages, llm);
        await extractAndSaveProjectMemory(sessionMessages, llm);
        exit();
    };

    useInput((inputKey, key) => {
        if (confirmRequest) return;
        if (escalation) return;
        if (statusState === 'working') return;

        // Ctrl+V — read clipboard directly
        if (inputKey === '\x16' || (key.ctrl && inputKey === 'v')){
            try {
                ctrlVHandledRef.current = true;
                const text = execSync(
                    'xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null',
                    { encoding: 'utf8', timeout: 2000 }
                ).trimEnd();
                if (!text) return;
                if (text.includes('\n')) {
                    // multi-line → clipping section
                    setPastedContent(prev => prev ? `${prev}\n\n${text}` : text);
                } else {
                    // single line → goes straight into input field
                    setInput(prev => prev + text);
                    previousInputRef.current = input + text;
                }
            } catch {}
            return;
        }
        if (key.escape && pastedContent) {
            setPastedContent('');
            return;
        }


        if (paletteItems.length > 0) {
            if (key.upArrow) {
                setPaletteIndex(i => (i - 1 + paletteItems.length) % paletteItems.length);
                return;
            }
            if (key.downArrow) {
                setPaletteIndex(i => (i + 1) % paletteItems.length);
                return;
            }
            if (key.escape) {
                setInput('');
                return;
            }
        }

        if (key.upArrow){
            if (inputHistory.length === 0) return;
            const newIndex = Math.min(historyIndex + 1,inputHistory.length - 1);
            setHistoryIndex(newIndex);
            setInput(inputHistory[inputHistory.length - 1 - newIndex] ?? '');
        }

        if (key.downArrow){
            if(historyIndex <= 0){
                setHistoryIndex(-1);
                setInput('');
                return;
            }
            const newIndex = historyIndex -1;
            setHistoryIndex(newIndex);
            setInput(inputHistory[inputHistory.length - 1 - newIndex] ?? '');
        }



    });


    function pastePreview(content: string): { headline: string; body: string } {
        const lines = content.split('\n');
        const sizeKB = (content.length / 1024).toFixed(1);
        const lineCount = lines.length;
        const headline = `${lineCount} line${lineCount === 1 ? '' : 's'} · ${sizeKB} KB`;
        const firstNonEmpty = lines.find(l => l.trim()) ?? '';
        const truncated = firstNonEmpty.length > 80 ? firstNonEmpty.slice(0, 80) + '…' : firstNonEmpty;
        const moreNote = lineCount > 1 ? ` · +${lineCount - 1} more line${lineCount - 1 === 1 ? '' : 's'}` : '';
        return { headline, body: `${truncated}${moreNote}` };
    }



    React.useEffect(() => {
        setConfirmHandler((req) => {
            return new Promise((resolve) => {
                setConfirmRequest(req);
                setStatusState('awaiting');
                setConfirmResolver(() => resolve);
                log('confirm:resolver-set', { filePath: req.filePath });
            });
        });
    }, []);
    



    const handleSubmit = async (value: string)=>{

        let cmd = value.trim();

        if (pastedContent) {
            cmd = cmd ? `${pastedContent}\n\n${cmd}` : pastedContent;
            setPastedContent('');
        }


        setInput('');
        if(!cmd) return;

        setInputHistory(prev =>
            prev[prev.length - 1] === cmd ? prev : [...prev, cmd]
        );


        setHistoryIndex(-1);


        if (paletteItems.length > 0 && value.startsWith('/')) {
            const selected = paletteItems[paletteIndex];
            if (selected && selected.cmd !== value) {
                setInput(selected.cmd);
                return;
            }
        }




        if(cmd === '/exit'){
            await handleExit()
            return;
        }


        if(cmd === '/clear'){
            clearSession();
            setMessages([]);
            return;
        }
        if (cmd === '/reset') {
            clearSession();
            clearSummary();
            clearProjectMemory();
            setMessages([]);
            return;
        }



        if(cmd === '/help'){
            setMessages(prev => [...prev,{
                role: 'assistant',
                content: [
                    'Slash commands:',
                    '  /plan      — create or update plan.md',
                    '  /coder     — run the full coding pipeline',
                    '  /debug     — investigate and fix a bug',
                    '  /refactor  — structural code improvements',
                    '  /review    — read-only code analysis',
                    '  /git       — git operations',
                    '  /explain   — explain a concept or file',
                    '  /quick     — fast chat, no tools',
                    '',
                    'Session commands:',
                    '  /clear     — clear conversation (keep memory)',
                    '  /reset     — clear conversation + memory',
                    '  /model     — show current model',
                    '  /tools     — list available tools',
                    '  /memory    — show project memory',
                    '  /exit      — save session and exit',
                ].join('\n')
            }]);
            return;
        }


        if(cmd === '/model'){
            setMessages(prev => [...prev, {role: 'assistant',content: `Model: ${config.preferredModel ?? 'gpt-4o-mini'}`}]);
            return;
        }

        if(cmd === '/tools'){
            setMessages(prev=> [...prev,{
                role: 'assistant',
                content: [
                    'Available tools:',
                    '  listFiles       — list project files (supports glob patterns)',
                    '  readFile        — read a file by name or path',
                    '  searchCode      — grep for symbols, functions, keywords',
                    '  editFile        — make targeted edits to existing files',
                    '  writeFile       — create or overwrite a file',
                    '  bash            — run shell commands (risk-gated)',
                    '  webFetch        — fetch a URL and return markdown content',
                    '  readBackground  — read output from a background process',
                ].join('\n')
            }]);
            return;
        }

        if (cmd === '/memory') {
            const { loadProjectMemory } = await import('../projectMemory.js');
            const mem = loadProjectMemory();
            const content = mem
                ? [
                    `Tech stack: ${mem.techStack?.join(', ') ?? 'unknown'}`,
                    mem.architectureDecisions?.length ? `Architecture: ${mem.architectureDecisions.join(' · ')}` : '',
                    mem.todos?.length ? `TODOs: ${mem.todos.join(' · ')}` : '',
                ].filter(Boolean).join('\n')
                : 'No project memory recorded yet. Keep chatting — it builds automatically on exit.';

            setMessages(prev => [...prev, { role: 'assistant', content }]);
            return;
        }



        setMessages(prev => [...prev, {role: 'user', content: cmd}]);
        setStatusState('working')

        setToolLog([]);
        setPlanner({ status: 'idle' });
        setWorkflow({ status: 'idle' });
        setCoder({ status: 'idle' });
        setValidator({ status: 'idle' });
        setJudge({ status: 'idle' });


        try{


            const reply = await chat(
                cmd,
                (toolName, args) => {
                    const argStr = args ? String(Object.values(args)[0]) : '';
                    setToolLog(prev => {
                        const updated = prev.map(e =>
                            e.status === 'running' ? { ...e, status: 'done' as const } : e
                        );
                        return [...updated, { tool: toolName, target: argStr, status: 'running' }];
                    });
                },
                (status) => {
                    if (status.startsWith('Planning')) {
                        setPlanner({ status: 'active', detail: 'planning steps' });
                        setWorkflow({ status: 'queued' });
                        setCoder({ status: 'queued' });
                        setValidator({ status: 'queued' });
                        setJudge({ status: 'queued' });
                    } else if (status.startsWith('Building execution') || status.startsWith('Workflow')) {
                        setPlanner({ status: 'done' });
                        setWorkflow({ status: 'active', detail: 'building DAG' });
                    } else if (status.startsWith('Executing')) {
                        setWorkflow({ status: 'done' });
                        setCoder({ status: 'active', detail: 'editing files' });
                    } else if (status.startsWith('Validating')) {
                        setCoder({ status: 'done' });
                        setValidator({ status: 'active', detail: 'tsc + eslint' });
                    } else if (status.startsWith('Validation failed')) {
                        setValidator({ status: 'active', detail: status.replace('Validation failed', '').trim() });
                    } else if (status.startsWith('Judging') || status.startsWith('Judge:')) {
                        setValidator({ status: 'done' });
                        setJudge({ status: 'active', detail: 'reviewing output' });
                    } else if (status.startsWith('Escalating')) {
                        setJudge({ status: 'active', detail: 'escalating' });
                    }

                },
                (token) => setStreamingContent(prev => prev + token),
                (payload) => setEscalation(payload),
                (newTokens, newCost) => {
                    setTokens(prev => prev + newTokens);
                    setCost(prev => prev + newCost);
                },
            );

            setStreamingContent('');
            setMessages(prev => [...prev, {role: 'assistant', content: reply}]);


            if (explainMode && reply) {
                const explanation = await explainResponse(reply);
                if (explanation) {
                    setMessages(prev => [...prev, { role: 'explain', content: explanation }]);
                }
            }



        }catch(err:any){
            setMessages(prev => [...prev,{
                role: 'error',
                content: err?.message ?? 'Something went wrong.'
            }]);
        } finally {
            setToolLog(prev => prev.map(e =>
                e.status === 'running' ? { ...e, status: 'done' as const } : e
            ));
            setPlanner(p => p.status === 'active' ? { status: 'done' } : p);
            setWorkflow(w => w.status === 'active' ? { status: 'done' } : w);
            setCoder(c => c.status === 'active' ? { status: 'done' } : c);
            setValidator(v => v.status === 'active' ? { status: 'done' } : v);
            setJudge(j => j.status === 'active' ? { status: 'done' } : j);
            setStreamingContent('');
            setStatusState('idle');
        }



    };

    return (

         <Box flexDirection="column">
             {/* Welcome — only on first render */}
            <Static items={[1]}>
                {(_, i) => (
                    <Welcome
                        key={i}
                        name={config.name}
                        version="1.0.1"
                        workspace={{
                            path: process.cwd().replace(process.env.HOME ?? '', '~'),
                            branch: 'main',
                            files: 42,
                            loc: '8.1k LOC · ts/tsx',
                        }}
                        runtime={{
                            model: config.preferredModel,
                            toolsCount: 6,
                            explainOn: explainMode,
                            routerOn: true,
                        }}
                    />
                )}
            </Static>


         




        <Box flexDirection="column" padding={1}>



            {
                messages.map((msg, i)=>(
                    <Box key={i} flexDirection="column" marginBottom={1}> 

                        {msg.role === 'user' && (
                            <Box borderStyle="round" borderColor="white" paddingX={1}> 
                                <Text bold color="white">You</Text>
                                <Text wrap="wrap">{msg.content}</Text>
                            </Box>
                        )}
                    
                        {msg.role === 'assistant' && (() => {
                            const isLong = msg.content.split('\n').length > 6;
                            if (isLong) {
                                return (
                                    <Box flexDirection="column" marginLeft={1}>
                                        <Text bold color="cyan">Assistant</Text>
                                        <Text color="white">{msg.content}</Text>
                                    </Box>
                                );
                            }
                            return (
                                <Box borderStyle="round" borderColor="cyan" paddingX={1}>
                                    <Text bold color="cyan"> Assistant </Text>
                                    <Text color="white" wrap="wrap"> {msg.content} </Text>
                                </Box>
                            );
                        })()}


                        {
                            msg.role === 'error' && (
                                <Box borderStyle="round" borderColor="red" paddingX={1}>
                                    <Text bold color="red"> Error </Text>
                                    <Text color="red" wrap="wrap" >{msg.content}</Text>
                                </Box>
                            )
                        }

                        {msg.role === 'explain' && (
                            <ExplainCard footer="to switch: /explain off · or set explainMode: false in ~/.glitool/config.json">
                                {msg.content}
                            </ExplainCard>
                        )}
                    </Box>
                ))
            }

            {
                streamingContent !== '' && (
                    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
                        <Text bold color='cyan'>Assistant</Text>
                        <Text wrap="wrap">{streamingContent}▊</Text>
                    </Box>
                )
            }


            { (statusState === 'working' || planner.status !== 'idle') && (
                <Box flexDirection="column">
                    {planner.status !== 'idle' && (
                        <Pipeline planner={planner} workflow={workflow} coder={coder} validator={validator} judge={judge} />
                    )}
                    <ToolLog entries={toolLog} />
                </Box>
            )}



            <SlashPalette items={paletteItems} selectedIndex={paletteIndex} />

            {confirmRequest ? (
                <ConfirmCard
                    request={confirmRequest}
                    onChoice={(choice) => {
                        if (choice === 'd') return; // TODO: show full diff later
                        log('confirm:choice', { choice, hasResolver: !!confirmResolver });
                        const resolve = confirmResolver;
                        setConfirmRequest(null);
                        setConfirmResolver(null);
                        setStatusState('working');
                        resolve?.(choice === 'y');
                        log('confirm:resolved', { value: choice === 'y' });
                    }}
                />
            ) : (
                <>
                {pastedContent && (() => {
                    const { headline, body } = pastePreview(pastedContent);
                    return (
                        <Box
                            flexDirection="column"
                            borderStyle="round"
                            borderColor={colors.mustard}
                            paddingX={1}
                            marginBottom={0}
                        >
                            <Box>
                                <Text color={colors.mustard} bold>📎 PASTED  </Text>
                                <Text color={colors.muted}>{headline}</Text>
                                <Text color={colors.muted}>  ·  </Text>
                                <Text color={colors.amber} bold>Esc</Text>
                                <Text color={colors.muted}> to remove  ·  will prepend on send</Text>
                            </Box>
                            <Text color={colors.muted} dimColor>
                                {body}
                            </Text>
                        </Box>
                    );
                })()}
                <Box borderStyle="round" borderColor={input.length > 200 ? 'yellow' : 'green'} paddingX={1}>
                    <Text bold color="green"> You: </Text>
                    <TextInput
                        value={input}
                        onChange={handleChange}
                        onSubmit={handleSubmit}
                        placeholder="Type a message or /help..."
                    />
                    {input.length > 50 && (
                        <Text dimColor> [{input.length}]</Text>
                    )}
                </Box>
                </>
            )}




            {escalation && (
                <EscalationCard
                    payload={escalation}
                    onChoice={(choice: EscalationChoice) => {
                        if (choice === 'approve') {
                            setEscalation(null);
                        } else if (choice === 'abort') {
                            setMessages(prev => prev.slice(0, -1));
                            setEscalation(null);
                            setMessages(prev => [...prev, {
                                role: 'error',
                                content: 'Aborted. The last response was discarded.',
                            }]);
                        } else if (choice === 'correct') {
                            setEscalation(null);
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: 'Tell me what to fix and I will retry.',
                            }]);
                        }
                    }}
                />
            )}


        





        </Box>
            <StatusBar state={statusState} detail={statusDetail} model={config.preferredModel} tokens={tokens} cost={cost}/>
        </Box>
    )



};






