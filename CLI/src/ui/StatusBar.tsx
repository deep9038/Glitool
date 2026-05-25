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
    anonLeft?: number;
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


export const StatusBar = ({state,detail,tier,anonLeft,model,tokens,cost}:StatusBarProps)=>{
    const dotColor = STATE_COLOR[state];
    const stateLabel = STATE_LABEL[state];

    // Animate dot when working
    const SPINNER_FRAMES = ['◐','◓','◑','◒'];
    const [frame, setFrame] = React.useState(0);
    React.useEffect(() => {
        if (state !== 'working') return;
        const id = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 150);
        return () => clearInterval(id);
    }, [state]);

    const dotChar = state === 'working' ? SPINNER_FRAMES[frame] : symbols.statusDot;

    const leftParts = [stateLabel];
    if(detail) leftParts.push(detail);

    const rightParts: string[] = [];
    if (tier) {
        rightParts.push(`${tier}`);
    } else if (anonLeft !== undefined) {
        rightParts.push(anonLeft > 0 ? `${anonLeft} free left` : 'sign up for more');
    }
    rightParts.push(model);
    rightParts.push(formatTokens(tokens));

    return(
        <Box borderStyle="single" borderColor={colors.line} paddingX={1} justifyContent="space-between">
            <Box>
                <Text color={dotColor}>{dotChar}</Text>
                <Text color={colors.ink2}> {leftParts.join(' . ')}</Text>
            </Box>
            <Box>
                <Text color={colors.muted}>{rightParts.join(' · ')}</Text>
            </Box>
        </Box>
    )
}
