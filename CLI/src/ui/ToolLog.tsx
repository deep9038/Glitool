import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";
import { spinnerFrames } from "./symbols.js";
import { colors } from "./tokens.js";

export type ToolStatus = 'done' | 'running' | 'queued';

export interface ToolEntry {
    tool: string;
    target: string;
    status: ToolStatus;
    stat?: string;
}

interface ToolLogProps {
    entries: ToolEntry[];
}

const TOOL_ICON: Record<string, string> = {
    bash:                '$',
    writeFile:           '✎',
    editFile:            '✎',
    readFile:            '≡',
    listFiles:           '≡',
    searchCode:          '⌕',
    webFetch:            '↗',
    readBackgroundOutput:'⊙',
};

const TOOL_COLOR: Record<string, string> = {
    bash:      colors.mustard,
    writeFile: colors.amber,
    editFile:  colors.amber,
    readFile:  colors.teal,
    listFiles: colors.teal,
    searchCode:colors.teal,
    webFetch:  colors.violet,
};

function formatTarget(tool: string, target: string): string {
    let value = target;
    try {
        const parsed = JSON.parse(target);
        value = parsed.command ?? parsed.filePath ?? parsed.pattern
              ?? parsed.query ?? parsed.url ?? target;
    } catch {}

    if (tool === 'bash') {
        value = value.replace(/^npx\s+/, '').replace(/^node\s+/, '');
    }
    return value.length > 55 ? value.slice(0, 52) + '…' : value;
}

export const ToolLog = ({ entries }: ToolLogProps) => {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!entries.some(e => e.status === 'running')) return;
        const id = setInterval(() => setTick(t => t + 1), 120);
        return () => clearInterval(id);
    }, [entries]);

    if (entries.length === 0) return null;

    return (
        <Box flexDirection="column" marginLeft={2} marginBottom={1}>
            {entries.map((e, i) => (
                <ToolLogRow key={i} entry={e} tick={tick} />
            ))}
        </Box>
    );
};

const ToolLogRow = ({ entry, tick }: { entry: ToolEntry; tick: number }) => {
    const isRunning = entry.status === 'running';
    const isDone    = entry.status === 'done';

    const spinner = spinnerFrames[tick % spinnerFrames.length];
    const icon    = isRunning ? spinner : isDone ? '✓' : '·';
    const iconColor  = isRunning ? colors.amber : isDone ? colors.sage : colors.muted;
    const toolColor  = TOOL_COLOR[entry.tool] ?? colors.muted2;
    const toolIcon   = TOOL_ICON[entry.tool] ?? '·';
    const target     = formatTarget(entry.tool, entry.target);

    return (
        <Box>
            <Text color={iconColor}>{icon} </Text>
            <Text color={toolColor}>{toolIcon} </Text>
            <Text color={toolColor} dimColor={isDone}>{entry.tool}</Text>
            <Text color={colors.muted}> · </Text>
            <Text color={isDone ? colors.muted : colors.muted2}>{target}</Text>
            {entry.stat
                ? <Text color={colors.muted}>  {entry.stat}</Text>
                : null}
        </Box>
    );
};
