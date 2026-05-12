import React from 'react';
import { render, Box, Text } from 'ink';
import { RoleRow } from './RoleRow.js';
import { colors } from './tokens.js';
import { symbols } from './symbols.js';

const Demo = () => (
    <Box flexDirection="column" padding={1}>
        <RoleRow role="you" timestamp="14:08">
            <Text>where do we resolve the OpenAI key?</Text>
        </RoleRow>

        <RoleRow role="glitool">
            <Text>The key is loaded from ~/.glitool/.env at startup.</Text>
        </RoleRow>

        <RoleRow role="tools">
            <Text color={colors.sage}>{symbols.done} readFile → src/agent.ts</Text>
        </RoleRow>

        <RoleRow role="plan">
            <Text>1. Add /memory case</Text>
            <Text>2. Spawn $EDITOR</Text>
            <Text>3. Confirm before write</Text>
        </RoleRow>

        <RoleRow role="note">
            <Text color={colors.muted}>tip: pass -e to enable explain mode</Text>
        </RoleRow>
    </Box>
);

render(<Demo />);
