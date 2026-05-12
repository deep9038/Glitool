import React from "react";
import { Box ,Text } from "ink";
import { colors } from "./tokens.js";


interface ExplainCardProps {
    children: React.ReactNode;
    footer?: string;
}

export const ExplainCard = ({ children, footer }: ExplainCardProps) => (
    <Box
        borderStyle="single"
        borderColor={colors.amber}
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        paddingLeft={2}
        flexDirection="column"
        marginBottom={1}
    >
        <Text color={colors.amber} bold>💡 EXPLAIN</Text>
        <Box flexDirection="column" marginTop={1}>
            {typeof children === 'string' ? (
                <Text color={colors.ink2} wrap="wrap">{children}</Text>
            ) : (
                children
            )}
        </Box>
        {footer && (
            <Box marginTop={1}>
                <Text color={colors.muted}>{footer}</Text>
            </Box>
        )}
    </Box>
);