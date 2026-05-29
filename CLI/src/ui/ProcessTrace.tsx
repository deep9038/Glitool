import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { ProcessEvent, StageKind } from '../processEvents.js';

interface Props {
    events: ProcessEvent[];
    active: boolean;
}

const STAGE_COLOR: Record<StageKind, string> = {
    coding:      '#3e8a9a',
    debugging:   '#b54226',
    refactoring: '#3e8a9a',
    git:         '#5a8c5a',
    planning:    '#c4732e',
    review:      '#6c5ab8',
};

const STAGE_LABEL: Record<StageKind, string> = {
    coding:      'CODING',
    debugging:   'DEBUGGING',
    refactoring: 'REFACTORING',
    git:         'GIT',
    planning:    'PLANNING',
    review:      'REVIEW',
};

const TOOL_VERB: Record<string, string> = {
    readFile:   'read',
    writeFile:  'write',
    editFile:   'edit',
    searchCode: 'search',
    listFiles:  'list',
    bash:       'run',
    webFetch:   'fetch',
};

type SectionItem =
    | { type: 'reasoning'; text: string }
    | { type: 'tool'; tool: string; target: string };

type Section = {
    stage: StageKind;
    items: SectionItem[];
    done: boolean;
};

export const ProcessTrace = ({ events, active }: Props) => {
    

    const SPINNER = ['◐', '◓', '◑', '◒'];
const [frame, setFrame] = useState(0);

useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame(f => (f + 1) % SPINNER.length), 150);
    return () => clearInterval(id);
}, [active]);

    
    if (events.length === 0) return null;

    const sections: Section[] = [];
    for (const ev of events) {
        if (ev.type === 'stage_start') {
            sections.push({ stage: ev.stage, items: [], done: false });
        } else if (ev.type === 'stage_done') {
            if (sections.length > 0) sections[sections.length - 1].done = true;
        } else if (ev.type === 'reasoning' || ev.type === 'tool') {
            if (sections.length > 0) {
                sections[sections.length - 1].items.push(ev as SectionItem);
            }
        }
    }

    return (
        <Box flexDirection="column" marginBottom={1}>
            {sections.map((sec, si) => {
                const color = STAGE_COLOR[sec.stage];
                const isLast = si === sections.length - 1;
                const spinning = isLast && !sec.done && active;
               const bullet = sec.done ? '●' : (spinning ? SPINNER[frame] : '○');

                return (
                    <Box key={si} flexDirection="column" marginBottom={isLast ? 0 : 1}>
                        <Box>
                            <Text color={color} bold>
                                {bullet} {STAGE_LABEL[sec.stage]}
                            </Text>
                            {spinning && <Text color={color}> ···</Text>}
                        </Box>
                        {sec.items.map((item, ii) => {
                            if (item.type === 'reasoning') {
                                return item.text
                                    .split('\n')
                                    .filter(Boolean)
                                    .slice(0, 4)
                                    .map((line, li) => (
                                        <Box key={`${ii}-${li}`} marginLeft={2}>
                                            <Text color="#8a8170" italic>
                                                {line.trim()}
                                            </Text>
                                        </Box>
                                    ));
                            }
                            if (item.type === 'tool') {
                                const verb = TOOL_VERB[item.tool] ?? item.tool;
                                return (
                                    <Box key={ii} marginLeft={2}>
                                        <Text color={color}>  ✓ {verb}</Text>
                                        {item.target ? (
                                            <Text color="#b3a994">  {item.target}</Text>
                                        ) : null}
                                    </Box>
                                );
                            }
                            return null;
                        })}
                    </Box>
                );
            })}
        </Box>
    );
};
