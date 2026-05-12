import React from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "./tokens.js";
import { symbols } from "./symbols.js";
import type { ConfirmRequest } from "../confirmHandler.js";


interface ConfirmCardProps{
    request: ConfirmRequest;
    onChoice: (choice: 'y' | 'n' | 'd') => void;
}

type DiffLineData = { type: 'add' | 'remove' | 'context'; text: string};


function buildDiff(req: ConfirmRequest): DiffLineData[] {
    const lines:DiffLineData[] = [];

    if (req.type === 'write'){
        const all = (req.content ?? '').split('\n');
        all.slice(0, 20).forEach(text => lines.push({type: 'add',text}))
        if (all.length > 20){
            lines.push({type: 'context',text: `...${all.length - 20} more lines`});
        }
    } else {
        (req.oldString ?? '').split('\n').forEach(text => lines.push({type: 'remove',text}));
        (req.newString ?? '').split('\n').forEach(text => lines.push({ type: 'add', text }));
    }
    return lines;
}


const DiffLine = ({line} : {line:DiffLineData} )=>{
    if(line.type === 'add'){
        return <Text color={colors.sage}> {symbols.add} {line.text}</Text>;
    }

    if (line.type === 'remove'){
        return <Text color={colors.rust}> {symbols.remove} {line.text}</Text>
    }

    return <Text color={colors.muted}> {line.text}</Text>
}


export const ConfirmCard = ({request,onChoice}: ConfirmCardProps) =>{
    useInput((input,key) => {
        const lower = input.toLowerCase();
        if (lower === 'y' || key.return) {onChoice('y'); return}
        if (lower === 'n' || key.escape) { onChoice('n'); return}
        if (lower === 'd' ) { onChoice('d'); return}
    });

    const risk = request.risk ?? 'low';
    const riskColor = risk === 'high' ? colors.rust : colors.mustard;
    const verb = request.type === 'write' ? 'write' : 'edit';


    const diffLines = buildDiff(request);
    const added = diffLines.filter(l => l.type === 'add').length;
    const removed = diffLines.filter(l => l.type === 'remove').length;


    return (
        <Box flexDirection="column" marginBottom={1}>
            <Box marginBottom={1}>
                <Text color={colors.mustard} bold>{symbols.warning}</Text>
                <Text color={colors.ink} bold>glitool wants to {verb} {request.filePath}</Text>
                <Text color={colors.muted}>     </Text>
                <Text color={riskColor} bold>risk · {risk}</Text>
            </Box>
            <Box borderStyle="single" borderColor={colors.line} flexDirection="column" paddingX={1}>
                <Box>
                    <Box flexGrow={1}><Text color={colors.muted}>{request.filePath}</Text></Box>
                    <Text color={colors.sage}>+{added}</Text>
                    <Text color={colors.muted}>  </Text>
                    <Text color={colors.rust}>-{removed}</Text>
                </Box>
                {diffLines.map((line, i) => (
                    <DiffLine key={i} line={line} />
                ))}
            </Box>
            <Box marginTop={1}>
                <Text color={colors.muted}>Apply this change?   </Text>
                <Text color={colors.amber} bold>[d]</Text>
                <Text color={colors.muted}> view full diff   </Text>
                <Text color={colors.amber} bold>[n]</Text>
                <Text color={colors.muted}> reject   </Text>
                <Text color={colors.amber} bold>[y]</Text>
                <Text color={colors.muted}> approve</Text>
            </Box>
        </Box>
    )


}
