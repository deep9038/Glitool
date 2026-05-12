import React from "react";
import { Box, Text} from 'ink';
import { colors } from "./tokens.js";



export interface SlashCommand {
    cmd: string;
    desc: string;
}



export const SLASH_COMMANDS: SlashCommand[] = [
    { cmd: '/help',   desc: 'List commands and shortcuts' },
    { cmd: '/model',  desc: 'Show or switch the active model' },
    { cmd: '/memory', desc: 'View or edit project memory and session summary' },
    { cmd: '/tools',  desc: 'List enabled tools and their permissions' },
    { cmd: '/clear',  desc: 'Clear current chat (keeps memory)' },
    { cmd: '/reset',  desc: 'Clear chat and wipe memory + summary' },
    { cmd: '/exit',   desc: 'Save summary and quit' },
];


interface SlashPaletteProps {
    items: SlashCommand[];
    selectedIndex: number;
}




export const SlashPalette = ({ items, selectedIndex }: SlashPaletteProps) => {
    if (items.length === 0) return null;

    return (
        <Box borderStyle="single" borderColor={colors.line} flexDirection="column" paddingX={1} marginBottom={1} >
            <Text color={colors.muted}>
                commands · type to filter · ↑↓ navigate · ⏎ run · esc dismiss
            </Text>
            {items.map((item, i) => {
                const isSelected = i === selectedIndex;
                return (
                    <Box key={item.cmd}>
                        <Box width={2}>
                            <Text color={colors.amber}>{isSelected ? '›' : ' '}</Text>
                        </Box>
                        <Box width={11}>
                            <Text color={isSelected ? colors.amber : colors.ink} bold={isSelected}>
                                {item.cmd}
                            </Text>
                        </Box>
                        <Text color={isSelected ? colors.ink2 : colors.muted}>
                            {item.desc}
                        </Text>
                    </Box>
                );
            })}
        </Box>
    );
};



export function filterCommands(input: string): SlashCommand[] {
    if (!input.startsWith('/')) return [];
    if (input === '/') return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(input));
}