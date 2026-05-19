import React, { useState, useEffect } from "react";
import { colors } from "./tokens.js";
import { Box, Text } from "ink";

export type AgentStatus = 'idle' | 'queued' | 'active' | 'done';

export interface AgentState {
    status: AgentStatus;
    detail?: string;
}

interface PipelineProps {
    planner:   AgentState;
    workflow:  AgentState;
    coder:     AgentState;
    validator: AgentState;
    judge:     AgentState;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const AGENT_META = {
    planner:   { label: 'Planner',   badge: 'P', color: colors.violet  },
    workflow:  { label: 'Workflow',  badge: 'W', color: colors.mustard },
    coder:     { label: 'Coder',     badge: 'C', color: colors.amber   },
    validator: { label: 'Validator', badge: 'V', color: colors.sage    },
    judge:     { label: 'Judge',     badge: 'J', color: colors.rust    },
};

type AgentKey = keyof typeof AGENT_META;

function useSpinner(): string {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 80);
        return () => clearInterval(id);
    }, []);
    return SPINNER_FRAMES[frame];
}

const ActiveCard = ({ name, badge, color, detail, spinner }: {
    name: string; badge: string; color: string; detail?: string; spinner: string;
}) => (
    <Box borderStyle="single" borderColor={color} paddingX={1} marginBottom={1}>
        <Text color={color} bold>{badge} </Text>
        <Text color="white" bold>{name}  </Text>
        <Text color={color}>{spinner}  </Text>
        <Text color={colors.muted}>{detail ?? 'working...'}</Text>
    </Box>
);

const DoneRow = ({ agents }: { agents: { label: string; badge: string; color: string }[] }) => (
    <Box marginBottom={1} paddingLeft={1}>
        {agents.map((a, i) => (
            <React.Fragment key={a.label}>
                <Text color={a.color} bold>{a.badge}</Text>
                <Text color={colors.sage}> ✓ </Text>
                {i < agents.length - 1 && <Text color={colors.muted}>· </Text>}
            </React.Fragment>
        ))}
    </Box>
);

export const Pipeline = ({ planner, workflow, coder, validator, judge }: PipelineProps) => {
    const spinner = useSpinner();

    const states: [AgentKey, AgentState][] = [
        ['planner',   planner],
        ['workflow',  workflow],
        ['coder',     coder],
        ['validator', validator],
        ['judge',     judge],
    ];

    const doneAgents = states
        .filter(([, s]) => s.status === 'done')
        .map(([key]) => AGENT_META[key]);

    const activeEntry = states.find(([, s]) => s.status === 'active');

    return (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
            {doneAgents.length > 0 && <DoneRow agents={doneAgents} />}
            {activeEntry && (
                <ActiveCard
                    name={AGENT_META[activeEntry[0]].label}
                    badge={AGENT_META[activeEntry[0]].badge}
                    color={AGENT_META[activeEntry[0]].color}
                    detail={activeEntry[1].detail}
                    spinner={spinner}
                />
            )}
        </Box>
    );
};
