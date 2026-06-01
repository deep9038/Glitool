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
    state:        StatusState;
    detail?:      string;
    plan?:        'anon' | 'free' | 'pro' | 'byok';
    model?:       string | null;
    tokensUsed?:  number;
    tokensLimit?: number;
}

// Compact display names. Falls back to last path segment for unknown models.
const MODEL_DISPLAY: Record<string, string> = {
    'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8': 'qwen3-coder',
    'deepseek-ai/DeepSeek-V4-Pro':             'deepseek-v4',
    'moonshotai/Kimi-K2.6':                    'kimi-k2.6',
    'Qwen/Qwen2.5-7B-Instruct-Turbo':          'qwen2.5-7b',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': 'llama-3.3-70b',
};

function displayModel(full: string | null | undefined): string {
    if (!full) return '—';
    if (MODEL_DISPLAY[full]) return MODEL_DISPLAY[full];
    const last = full.split('/').pop() ?? full;
    return last.toLowerCase();
}

function formatTokenCount(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatTokens(used: number | undefined, limit: number | undefined): string {
    const u = used ?? 0;
    if (!limit || limit <= 0) return `${formatTokenCount(u)} tokens`;
    return `${formatTokenCount(u)} / ${formatTokenCount(limit)} tokens`;
}

export const StatusBar = ({ state, detail, plan, model, tokensUsed, tokensLimit }: StatusBarProps) => {
    const dotColor   = STATE_COLOR[state];
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
    if (detail) leftParts.push(detail);

    const rightParts: string[] = [];
    if (plan) rightParts.push(plan);
    rightParts.push(displayModel(model));
    rightParts.push(formatTokens(tokensUsed, tokensLimit));

    return (
        <Box borderStyle="single" borderColor={colors.line} paddingX={1} justifyContent="space-between">
            <Box>
                <Text color={dotColor}>{dotChar}</Text>
                <Text color={colors.ink2}> {leftParts.join(' . ')}</Text>
            </Box>
            <Box>
                <Text color={colors.muted}>{rightParts.join(' · ')}</Text>
            </Box>
        </Box>
    );
};
