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
    const [currentIndex, setCurrentIndex] = useState(0);
    const [collectedAnswers, setCollectedAnswers] = useState<string[]>([]);
    const [input, setInput] = useState('');

    const isLast = currentIndex === questions.length - 1;

    const handleSubmit = (value: string) => {
        const trimmed = value.trim();
        if (trimmed === 's' || trimmed === '/skip') { onSkip(); return; }
        if (!trimmed) return;

        const updated = [...collectedAnswers, trimmed];

        if (isLast) {
            const combined = questions
                .map((q, i) => `Q${i + 1}: ${q}\nA: ${updated[i]}`)
                .join('\n\n');
            onAnswer(combined);
        } else {
            setCollectedAnswers(updated);
            setCurrentIndex(currentIndex + 1);
            setInput('');
        }
    };

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={1}>

            {/* Header */}
            <Box marginBottom={1} justifyContent="space-between">
                <Text bold color="yellow"> Clarification needed </Text>
                <Text color={colors.muted}> {currentIndex + 1} / {questions.length} </Text>
            </Box>

            {/* Previous answers */}
            {collectedAnswers.length > 0 && (
                <Box flexDirection="column" marginBottom={1}>
                    {collectedAnswers.map((ans, i) => (
                        <Box key={i} gap={1}>
                            <Text dimColor>{questions[i].split('\n')[0].slice(0, 45)}...</Text>
                            <Text color={colors.muted}>→</Text>
                            <Text color="green">{ans}</Text>
                        </Box>
                    ))}
                </Box>
            )}

            {/* Current question */}
            <Box marginBottom={1} flexDirection="column">
                {questions[currentIndex].split('\n').map((line, i) => (
                    <Text key={i} bold={i === 0} color={i === 0 ? 'yellow' : colors.muted}>
                        {line}
                    </Text>
                ))}
            </Box>

            <Text dimColor>type 's' to skip · {isLast ? 'Enter to submit' : 'Enter for next question'}</Text>

            <Box borderStyle="round" borderColor="green" paddingX={1} marginTop={1}>
                <Text bold color="green"> You: </Text>
                <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    placeholder="Your answer..."
                />
            </Box>
        </Box>
    );
};
