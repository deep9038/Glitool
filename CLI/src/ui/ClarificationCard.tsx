import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from './tokens.js';

type Props = {
    questions: string[];
    onAnswer: (answers: string) => void;
    onSkip: () => void;
};

export const ClarificationCard = ({ questions, onAnswer, onSkip }: Props) => {
    const [input, setInput] = useState('');

    const handleSubmit = (value: string) => {
        const trimmed = value.trim();
        if (trimmed === 's' || trimmed === '/skip') {
            onSkip();
            return;
        }
        if (!trimmed) return;
        onAnswer(trimmed);
    };

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={1}>
            <Box marginBottom={1}>
                <Text bold color="yellow"> Clarification needed </Text>
            </Box>
            <Text color={colors.muted}>Before I start, I need a few details:</Text>
            <Box flexDirection="column" marginY={1}>
                {questions.map((q, i) => (
                    <Box key={i}>
                        <Text bold color="yellow">{i + 1}. </Text>
                        <Text>{q}</Text>
                    </Box>
                ))}
            </Box>
            <Text dimColor>Answer all in one message  ·  type 's' to skip and let me make assumptions</Text>
            <Box borderStyle="round" borderColor="green" paddingX={1} marginTop={1}>
                <Text bold color="green"> You: </Text>
                <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    placeholder="Your answers..."
                />
            </Box>
        </Box>
    );
};
