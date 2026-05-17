import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from './tokens.js';
import type { TrajectoryEntry } from '../agents/graph.js';

export interface EscalationPayload {
    userMessage: string;
    plan: string;
    trajectory: TrajectoryEntry[];
    finalOutput: string;
}

export type EscalationChoice = 'approve' | 'correct' | 'abort';

interface Props {
    payload: EscalationPayload;
    onChoice: (choice: EscalationChoice) => void;
}

export const EscalationCard = ({ payload, onChoice }: Props) => {
    useInput((input) => {
        const k = input.toLowerCase();
        if (k === 'a') onChoice('approve');
        else if (k === 'c') onChoice('correct');
        else if (k === 'x') onChoice('abort');
    });

    const planPreview = payload.plan.length > 400
        ? payload.plan.slice(0, 400) + '…'
        : payload.plan;

    const outputPreview = payload.finalOutput.length > 300
        ? payload.finalOutput.slice(0, 300) + '…'
        : payload.finalOutput;

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={colors.amber}
            paddingX={1}
            marginBottom={1}
        >
            <Text bold color={colors.amber}>
                {`⚠ Escalation — Judge gave up after ${payload.trajectory.length} attempts`}
            </Text>

            <Box marginTop={1} flexDirection="column">
                <Text color={colors.muted}>Original request:</Text>
                <Text wrap="wrap">{payload.userMessage}</Text>
            </Box>

            <Box marginTop={1} flexDirection="column">
                <Text color={colors.muted}>Plan:</Text>
                <Text color="white" wrap="wrap">{planPreview}</Text>
            </Box>

            <Box marginTop={1} flexDirection="column">
                <Text color={colors.muted}>Judge trail:</Text>
                {payload.trajectory.map((t) => (
                    <Box key={t.iteration}>
                        <Text color="gray">{`  #${t.iteration} `}</Text>
                        <Text color={t.verdict === 'ok' ? 'green' : 'red'}>
                            {t.verdict.toUpperCase()}
                        </Text>
                        <Text color="gray">{` · ${t.failure_point ?? 'none'} · `}</Text>
                        <Text wrap="wrap">{t.reason}</Text>
                    </Box>
                ))}
            </Box>

            <Box marginTop={1} flexDirection="column">
                <Text color={colors.muted}>Current output (preview):</Text>
                <Text wrap="wrap">{outputPreview}</Text>
            </Box>

            <Box marginTop={1}>
                <Text bold color="green">[a]</Text>
                <Text>{' approve as-is  '}</Text>
                <Text bold color="yellow">[c]</Text>
                <Text>{' give correction  '}</Text>
                <Text bold color="red">[x]</Text>
                <Text>{' abort'}</Text>
            </Box>
        </Box>
    );
};
