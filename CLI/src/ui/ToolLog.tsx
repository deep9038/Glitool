import { Box, Text, } from "ink";
import React, { useEffect, useState } from "react";
import { spinnerFrames, symbols } from "./symbols.js";
import { colors } from "./tokens.js";





export type ToolStatus = 'done' | 'running' | 'queued'

export interface ToolEntry{
    tool: string;
    target: string;
    status: ToolStatus;
    stat?:string;
}





interface ToolLogProps {
    entries: ToolEntry[];
}


export const ToolLog = ({ entries }: ToolLogProps) => {
    const [tick,setTick] = useState(0);
    useEffect(()=>{
        if (!entries.some(e => e.status === 'running')) return;
        const i = setInterval(()=> setTick(t => t+1),200);
        return () => clearInterval(i)
    },[entries])
    if (entries.length === 0) return null;
    return (
        <Box flexDirection="column" marginBottom={1}>
            {entries.map((e, i) => (
                <ToolLogRow key={i} entry={e} tick={tick} />
            ))}
        </Box>
    )
}


const ToolLogRow = ({ entry, tick }: { entry: ToolEntry; tick: number }) => {
    const isRunning = entry.status === 'running';
    const isDone = entry.status === 'done';

    const icon = isRunning
        ? spinnerFrames[tick % spinnerFrames.length]
        : isDone ? symbols.done : symbols.queued;

    const iconColor = isRunning ? colors.amber : isDone ? colors.sage : colors.muted;
    const nameColor = isRunning ? colors.amber : colors.ink2;

    const toolName = (entry.tool ?? '').padEnd(12);
    const target = entry.target ?? '';

    return (
        <Box paddingLeft={2}>
            <Text color={iconColor}>{`${icon} `}</Text>
            <Text color={nameColor}>{`${toolName} `}</Text>
            <Text color={colors.muted2}>{`${symbols.arrow} `}</Text>
            <Text color={colors.ink}>{target}</Text>
            {entry.stat ? <Text color={colors.muted}>{`  ${entry.stat}`}</Text> : null}
        </Box>
    );
};