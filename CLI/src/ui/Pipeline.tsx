import React from "react";
import { colors } from "./tokens.js";
import { symbols } from "./symbols.js";
import { Box, Text } from "ink";


export type AgentStatus = 'idle' | 'queued' | 'active' | 'done';



export interface AgentState{
    status:AgentStatus;
    detail?:string;
}


interface PipelineProps{
    planner: AgentState;
    coder: AgentState;
    reviewer: AgentState;
}


const AGENT_COLOR = {
    planner: colors.violet,
    coder: colors.amber,
    reviewer: colors.teal
}


const STATE_LABEL: Record<AgentStatus,string> ={
    idle: 'idle',
    queued: 'queued',
    active: 'active',
    done: 'done'
}




const STATE_BORDER: Record<AgentStatus,string> = {
    idle: colors.muted2,
    queued:colors.muted2,
    active: colors.amber,
    done: colors.sage
}



const STATE_ICON: Record<AgentStatus, string> = {
    idle:   symbols.queued,
    queued: symbols.queued,
    active: symbols.running,
    done:   symbols.done,
};

const AgentCard  = ({name,badge,badgeColor,state,stack}: { name: string; badge: string; badgeColor: string; state: AgentState; stack: boolean}) =>(
    <Box borderStyle="single" borderColor={STATE_BORDER[state.status]} flexDirection="column" paddingX={1} flexGrow={stack ? 0 : 1} marginRight={stack ? 0 : 1} marginBottom={stack ? 1 : 0}>
        <Box>
            <Text color={badgeColor} bold>{badge} </Text>
            <Text color={colors.ink} bold>{name}</Text>
            <Text color={colors.muted}>  {STATE_ICON[state.status]} {STATE_LABEL[state.status]}</Text>
        </Box>
        {state.detail && (
            <Text color={colors.muted}>{state.detail}</Text>
        )}
    </Box>
);


export const Pipeline = ({planner,coder, reviewer}: PipelineProps) => {
    const cols = process.stdout.columns ?? 80;
    const stack = cols < 100;

    return(

        <Box flexDirection={stack ? 'column' : 'row'} marginBottom={1} paddingLeft={2}>
            <AgentCard name="Planner"  badge="P" badgeColor={AGENT_COLOR.planner}  state={planner}  stack={stack} />
            <AgentCard name="Coder"    badge="C" badgeColor={AGENT_COLOR.coder}    state={coder}    stack={stack} />
            <AgentCard name="Reviewer" badge="R" badgeColor={AGENT_COLOR.reviewer} state={reviewer} stack={stack} />
        </Box>

    )



}



