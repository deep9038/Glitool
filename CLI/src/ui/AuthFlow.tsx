import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { colors } from './tokens.js';
import { startDeviceFlow, pollDeviceFlow, saveAuth } from '../auth.js';
import type { DeviceFlowStart, AuthData } from '../auth.js';

interface AuthFlowProps {
    onDone:   (auth: AuthData) => void;
    onCancel: () => void;
}

const SPINNER = ['◐', '◓', '◑', '◒'];

export const AuthFlow = ({ onDone, onCancel }: AuthFlowProps) => {
    const [flow,  setFlow]  = useState<DeviceFlowStart | null>(null);
    const [phase, setPhase] = useState<'loading' | 'waiting' | 'success' | 'expired' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [frame, setFrame] = useState(0);
    const pollTimer = useRef<NodeJS.Timeout | null>(null);
    const spinTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        spinTimer.current = setInterval(() => setFrame(f => (f + 1) % SPINNER.length), 180);

        startDeviceFlow()
            .then(data => {
                setFlow(data);
                setPhase('waiting');

                pollTimer.current = setInterval(async () => {
                    try {
                        const result = await pollDeviceFlow(data.device_code);
                        if (result.status === 'complete' && result.access_token) {
                            clearInterval(pollTimer.current!);
                            clearInterval(spinTimer.current!);
                            const auth: AuthData = {
                                token:             result.access_token,
                                plan:              result.plan ?? 'free',
                                email:             result.email ?? '',
                                requestsRemaining: result.requests_remaining ?? 50,
                                resetDate:         result.reset_date ?? '',
                                savedAt:           new Date().toISOString(),
                            };
                            saveAuth(auth);
                            setPhase('success');
                            setTimeout(() => onDone(auth), 1200);
                        } else if (result.status === 'expired') {
                            clearInterval(pollTimer.current!);
                            clearInterval(spinTimer.current!);
                            setPhase('expired');
                        }
                    } catch {
                        // network hiccup — keep polling
                    }
                }, 5000);
            })
            .catch(err => {
                clearInterval(spinTimer.current!);
                setPhase('error');
                setErrorMsg(err?.message ?? 'Could not reach Glitool server');
            });

        return () => {
            if (pollTimer.current) clearInterval(pollTimer.current);
            if (spinTimer.current) clearInterval(spinTimer.current);
        };
    }, []);

    if (phase === 'loading') {
        return (
            <Box borderStyle="round" borderColor={colors.amber} paddingX={1}>
                <Text color={colors.amber}>{SPINNER[frame]}  </Text>
                <Text color={colors.muted}>Connecting to Glitool...</Text>
            </Box>
        );
    }

    if (phase === 'error') {
        return (
            <Box borderStyle="round" borderColor={colors.rust} paddingX={1} flexDirection="column">
                <Text color={colors.rust}>✗ Sign-in failed: {errorMsg}</Text>
                <Text color={colors.muted} dimColor>Type /signup to try again, or Esc to cancel.</Text>
            </Box>
        );
    }

    if (phase === 'expired') {
        return (
            <Box borderStyle="round" borderColor={colors.rust} paddingX={1} flexDirection="column">
                <Text color={colors.rust}>✗ Code expired.</Text>
                <Text color={colors.muted} dimColor>Type /signup to get a new code.</Text>
            </Box>
        );
    }

    if (phase === 'success') {
        return (
            <Box borderStyle="round" borderColor={colors.sage} paddingX={1}>
                <Text color={colors.sage}>✓ Signed in! Glitool is ready.</Text>
            </Box>
        );
    }

    // waiting
    const activateUrl = `${flow!.verification_uri}?code=${flow!.user_code}`;
    return (
        <Box borderStyle="round" borderColor={colors.amber} paddingX={1} flexDirection="column">
            <Text color={colors.amber} bold>Sign in to Glitool  (free · 50 req/month)</Text>
            <Text> </Text>
            <Text color={colors.muted}>1.  Open this URL in your browser:</Text>
            <Text color="cyan">    {activateUrl}</Text>
            <Text> </Text>
            <Text color={colors.muted}>2.  Your terminal code: <Text color="white" bold>{flow!.user_code}</Text></Text>
            <Text> </Text>
            <Text color={colors.muted}>{SPINNER[frame]}  Waiting for sign-in...  <Text dimColor>(Esc to cancel)</Text></Text>
        </Box>
    );
};
