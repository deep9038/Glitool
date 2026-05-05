import React, {useState, useCallback} from "react";
import { Box,Text, useApp } from 'ink';
import TextInput from "ink-text-input";
import { chat, clearSession, llm, sessionMessages } from '../agent.js';
import { clearSummary, generateAndSaveSummary } from "../memory.js";
import { clearProjectMemory, extractAndSaveProjectMemory } from "../projectMemory.js";
import { useInput } from 'ink';
import { setConfirmHandler } from "../confirmHandler.js";
import { explainResponse } from "../agents/explainer.js";

type Message = {
    role: 'user' | 'assistant' | 'error' | 'explain';
    content: string;
};
type AppProps = { explainMode?: boolean };

const COMMANDS = ['/help', '/clear', 'model', '/tools', '/exit', '/reset'];

export const App = ({ explainMode = false }: AppProps) => {

    const { exit } = useApp();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [toolInfo, setToolInfo] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);

    const [confirmMessage,setConfirmMessage] = useState('')
    const [confirmInput,setConfirmInput] = useState('');
    const [confirmResolver,setConfirmResolver] = useState<((v: boolean)=> void) | null>(null);

    const [streamingContent, setStreamingContent] = useState('');

    const [inputHistory, setInputHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);



    const handleChange = (value: string) => {
        setInput(value);
        if (value.startsWith('/')){
            const matches = COMMANDS.filter(c => c.startsWith(value));
            setSuggestions(value === matches[0] ? [] : matches);
        }else {
            setSuggestions([]);
        }
    }

    const handleExit = async () => {
        await generateAndSaveSummary(sessionMessages, llm);
        await extractAndSaveProjectMemory(sessionMessages, llm);
        exit();
    };

    useInput((_, key) => {
        if (confirmMessage) return;
        if (isThinking) return;

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


        if (key.tab && suggestions.length >0){
            setInput(suggestions[0] ?? '');
            setSuggestions([]);
        }
    });

    React.useEffect(()=>{
        setConfirmHandler((messages)=>{
            return new Promise((resolve) => {
                setConfirmMessage(messages);
                setConfirmResolver(()=> resolve)
            })
        })
    },[])
    



    const handleSubmit = useCallback(async (value: string)=>{

        const cmd = value.trim();
        setInput('');
        setSuggestions([]);

        if(!cmd) return;

        setInputHistory(prev =>
            prev[prev.length - 1] === cmd ? prev : [...prev, cmd]
        );
        setHistoryIndex(-1);

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
            setMessages(prev => [...prev, {role: 'assistant', content: 'Model: gpr-5-mini'}]);
            return;
        }

        if(cmd === '/tools'){
            setMessages(prev=> [...prev,{
                role: 'assistant',
                content: 'Tools: listFile readFile searchCode editFile writeFile analyzeProject'
            }]);
            return;
        }

        setMessages(prev => [...prev, {role: 'user', content:cmd}]);
        setIsThinking(true);

        try{
            const reply = await chat(cmd, (toolName, args) => {
                const argStr = args ? String(Object.values(args)[0]) : '';
                setToolInfo(`⚙  ${toolName}${argStr ? ` -> ${argStr}` : ''} `);
            }, (status) => {
                setToolInfo(status);
            }, (token)=>{
                setStreamingContent(prev => prev + token);
            });
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
            setIsThinking(false);
            setToolInfo('');
        }



    }, [exit]);

    return (
        <Box flexDirection="column" padding={1}>

            <Box marginBottom={1}>
                <Text bold color="green">glitool</Text>
                <Text dimColor>- AI coding assistant</Text>
            </Box>

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
                                <Text bold color="red"> Assistant   </Text>
                                <Text color="red" wrap="wrap"> {msg.content} </Text>
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

                        {
                            msg.role === 'explain' && (
                                <Box borderStyle="round" borderColor="magenta" paddingX={1}>
                                    <Text bold color="magenta">💡 Explain </Text>
                                    <Text wrap="wrap">{msg.content}</Text>
                                </Box>
                            )
                        }
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


            {
                isThinking && (
                    <Box marginBottom={1} padding={1}>
                        <Text color="yellow" >{toolInfo || 'Thinking...'}</Text>
                    </Box>
                )
            }



            { suggestions.length > 0 && (
                <Box flexDirection="column" marginBottom={1} paddingX={2}>
                    {
                        suggestions.map(s =>(
                            <Text key={s} dimColor>{s}</Text>
                        ))
                    }
                </Box>
            )}

            {confirmMessage !== '' ? (
                <Box borderStyle="round" borderColor="yellow" paddingX={1}>
                    <Text color="yellow" > {confirmMessage} (y/n): </Text>
                    <TextInput value={confirmInput} onChange={setConfirmInput} onSubmit={(val)=>{
                        const approved = val.toLowerCase() === 'y' || val === '';
                        confirmResolver?.(approved);
                        setConfirmMessage('');
                        setConfirmInput('')
                        setConfirmResolver(null);
                    }}/>
                </Box>
            ):
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
            }

            



            {/* <Box borderStyle="round" borderColor="green" paddingX={1}>
                <Text bold color="green"> You:</Text>
                <TextInput value={input} 
                onChange={handleChange}
                onSubmit={handleSubmit}
                placeholder="Type a message or /help..."/>
            </Box> */}






        </Box>
    )



};






