import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from './tokens.js';
import type { ClarifierQuestion } from '../clarifier.js';

type Props = {
    questions: ClarifierQuestion[];
    onAnswer: (answers: string) => void;
    onSkip: () => void;
};

export const ClarificationCard = ({ questions, onAnswer, onSkip }: Props) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [collectedAnswers, setCollectedAnswers] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const [otherMode, setOtherMode] = useState(false);

    const current = questions[currentIndex];
    const options = current?.options;
    const showOptions = !!options && options.length > 0 && !otherMode;
    const otherIndex = options ? options.length + 1 : 0;
    const isLast = currentIndex === questions.length - 1;

    const advance = (answer: string) => {
        const updated = [...collectedAnswers, answer];
        if (isLast) {
            const combined = questions
                .map((q, i) => `Q${i + 1}: ${q.question}\nA: ${updated[i]}`)
                .join('\n\n');
            onAnswer(combined);
        } else {
            setCollectedAnswers(updated);
            setCurrentIndex(currentIndex + 1);
            setInput('');
            setOtherMode(false);
        }
    };

    const handleSubmit = (value: string) => {
        const trimmed = value.trim();
        if (trimmed === 's' || trimmed === '/skip') { onSkip(); return; }
        if (!trimmed) return;
        advance(trimmed);
    };

    // Single-keypress capture for the numbered-options view
    useInput((ch) => {
        if (!showOptions) return;
        if (ch === 's') { onSkip(); return; }
        const n = parseInt(ch, 10);
        if (isNaN(n)) return;
        if (n >= 1 && n <= options!.length) {
            advance(options![n - 1]);
        } else if (n === otherIndex) {
            setOtherMode(true);
        }
    }, { isActive: showOptions });

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
                            <Text dimColor>{questions[i].question.slice(0, 45)}...</Text>
                            <Text color={colors.muted}>→</Text>
                            <Text color="green">{ans}</Text>
                        </Box>
                    ))}
                </Box>
            )}

            {/* Current question */}
            <Box marginBottom={1}>
                <Text bold color="yellow">{current.question}</Text>
            </Box>

            {/* Options OR text input */}
            {showOptions ? (
                <Box flexDirection="column">
                    {options!.map((opt, i) => (
                        <Box key={i}>
                            <Text color="cyan"> {i + 1} </Text>
                            <Text> {opt}</Text>
                        </Box>
                    ))}
                    <Box>
                        <Text color="cyan"> {otherIndex} </Text>
                        <Text dimColor> Other (type your own)</Text>
                    </Box>
                    <Box marginTop={1}>
                        <Text dimColor>press 1-{otherIndex} · 's' to skip</Text>
                    </Box>
                </Box>
            ) : (
                <>
                    <Text dimColor>type 's' to skip · {isLast ? 'Enter to submit' : 'Enter for next question'}</Text>
                    <Box borderStyle="round" borderColor="green" paddingX={1} marginTop={1}>
                        <Text bold color="green"> You: </Text>
                        <TextInput
                            value={input}
                            onChange={setInput}
                            onSubmit={handleSubmit}
                            placeholder={otherMode ? 'Your own answer...' : 'Your answer...'}
                        />
                    </Box>
                </>
            )}
        </Box>
    );
};
