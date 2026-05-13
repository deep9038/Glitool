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
    const previousInputRef = useRef('');     // ← ADD HERE
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
    const [reviewer, setReviewer] = useState<AgentState>({ status: 'idle' });


    const [paletteIndex, setPaletteIndex] = useState(0);

    const paletteItems: SlashCommand[] = filterCommands(input);

    const handleChange = (value: string) => {
        const previousLen = previousInputRef.current.length;
        const currentLen = value.length;
        const grew = currentLen - previousLen;
        const isPaste = grew > 10 || /[\r\n]/.test(value);

        if (isPaste && currentLen > 30) {
            setPastedContent(value);
            setInput('');
            previousInputRef.current = '';
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
        if (statusState === 'working') return;

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

    React.useEffect(() => {
        setConfirmHandler((req) => {
            return new Promise((resolve) => {
                setConfirmRequest(req);
                setStatusState('awaiting');
                setConfirmResolver(() => resolve);
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
                content: 'Commands: /exit /clear /model /tools /help'
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
                content: 'Tools: listFile readFile searchCode editFile writeFile analyzeProject'
            }]);
            return;
        }

        if (cmd === '/memory') {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Project memory not yet implemented.'
            }]);
            return;
        }


        setMessages(prev => [...prev, {role: 'user', content: cmd}]);
        setStatusState('working')

        setToolLog([]);
        setPlanner({ status: 'idle' });
        setCoder({ status: 'idle' });
        setReviewer({ status: 'idle' });

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
                        setCoder({ status: 'queued' });
                        setReviewer({ status: 'queued' });
                    } else if (status.startsWith('Executing')) {
                        setPlanner({ status: 'done' });
                        setCoder({ status: 'active', detail: 'editing files' });
                        setReviewer({ status: 'queued' });
                    } else if (status.startsWith('Reviewing')) {
                        setCoder({ status: 'done' });
                        setReviewer({ status: 'active', detail: 'checking output' });
                    }
                },
                (token) => setStreamingContent(prev => prev + token)
            );

            setToolLog(prev => prev.map(e =>
                e.status === 'running' ? { ...e, status: 'done' as const } : e
            ));


            setPlanner(p => p.status === 'idle' ? p : { status: 'done' });
            setCoder(c => c.status === 'idle' ? c : { status: 'done' });
            setReviewer(r => r.status === 'idle' ? r : { status: 'done' });


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
            setStatusState('idle')
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
                    
                        {msg.role === 'assistant' && (
                            <Box borderStyle="round" borderColor="cyan" paddingX={1}>
                                <Text bold color="cyan"> Assistant </Text>
                                <Text color="white" wrap="wrap"> {msg.content} </Text>
                            </Box>
                        )}

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
                        <Pipeline planner={planner} coder={coder} reviewer={reviewer} />
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
                        confirmResolver?.(choice === 'y');
                        setConfirmRequest(null);
                        setConfirmResolver(null);
                        setStatusState('idle');
                    }}
                />
            ) : (
                <>
                {pastedContent && (
                    <Box paddingLeft={2} marginBottom={0}>
                        <Text color={colors.mustard}>📎 </Text>
                        <Text color={colors.muted}>
                            Pasted text · {pastedContent.split('\n').length} lines · {pastedContent.length} chars ·{' '}
                        </Text>
                        <Text color={colors.amber} bold>Esc</Text>
                        <Text color={colors.muted}> to remove</Text>
                    </Box>
                )}
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


            



            {/* <Box borderStyle="round" borderColor="green" paddingX={1}>
                <Text bold color="green"> You:</Text>
                <TextInput value={input} 
                onChange={handleChange}
                onSubmit={handleSubmit}
                placeholder="Type a message or /help..."/>
            </Box> */}






        </Box>
                <StatusBar
            state={statusState}
            detail={statusDetail}
            model={config.preferredModel}
            tokens={tokens}
            cost={cost}
        />
        </Box>
    )



};






