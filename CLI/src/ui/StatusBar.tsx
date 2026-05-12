import React from "react";
import { Box, Text } from "ink";
import { colors } from "./tokens.js";
import { symbols } from "./symbols.js";

export type StatusState = 'idle' | 'ready' | 'working' | 'awaiting' | 'error';

const STATE_COLOR: Record<StatusState,string> = {
    idle:     colors.muted,
    ready:    colors.sage,
    working:  colors.amber,
    awaiting: colors.mustard,
    error:    colors.rust,
};

const STATE_LABEL: Record<StatusState, string> = {
    idle:     'idle',
    ready:    'ready',
    working:  'working',
    awaiting: 'awaiting confirm',
    error:    'error',
};

interface StatusBarProps {
    state: StatusState;
    detail?: string;
    tier?: string;
    model: string;
    tokens: number;
    cost: number;
}




function formatTokens(n: number): string{
    if (n<1000) return `${n} tokens`;
    return `${(n / 1000).toFixed(1)}k tokens`;
}


function formatCost(c:number) : string{
    return `$${c.toFixed(3)}`;
}


export const StatusBar = ({state,detail,tier,model,tokens,cost}:StatusBarProps)=>{
    const dotColor = STATE_COLOR[state];
    const stateLabel = STATE_LABEL[state];


    const leftParts = [stateLabel];

    if(detail) leftParts.push(detail);


    const rightParts: string[] = [];
    if (tier) rightParts.push(`${tier} tier`);

    rightParts.push(model);
    rightParts.push(formatTokens(tokens));
    rightParts.push(formatCost(cost));


    return(
        <Box borderStyle="single" borderColor={colors.line} paddingX={1} justifyContent="space-between">
            <Box>
                <Text color={dotColor}>{symbols.statusDot}</Text>
                <Text color={colors.ink2}>{leftParts.join(' . ')}</Text>
            </Box>

            <Box>
                <Text color={colors.muted}>{rightParts.join(' · ')}</Text>
            </Box>
        </Box>
    )




}