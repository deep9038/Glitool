import React from "react";
import { Box , Text } from 'ink';
import { colors } from "./tokens.js";
 

interface WarkspaceInfo {
    path: string;
    branch: string;
    files: number;
    loc?:string;
}


interface RuntimeInfo{
    model: string;
    toolsCount: number;
    explainOn:boolean;
    routerOn?:boolean
}




interface WelcomeProps{
    name: string;
    version: string;
    workspace:WarkspaceInfo;
    runtime: RuntimeInfo;
    sessionResumed?: boolean;
    priorTurns?: number;
}




const InfoRow = ({ label, children }: { label: string; children: React.ReactNode })=>(
    <Box>
        <Box><Text color={colors.muted}></Text></Box>
        <Box>{children}</Box>
    </Box>
)


const Card = ({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) => (
    <Box
        borderStyle="single"
        borderColor={colors.line}
        flexDirection="column"
        paddingX={1}
        marginBottom={1}
    >
        <Box>
            <Text color={colors.muted} bold>{title}</Text>
            {badge && <Text color={colors.sage}> [{badge}]</Text>}
        </Box>
        <Box flexDirection="column" marginTop={1}>
            {children}
        </Box>
    </Box>
);


export const Welcome = ({name,version,workspace,runtime,sessionResumed = false,priorTurns = 0,}: WelcomeProps)=>{
    const subtitle = sessionResumed ? `AI coding assistant · session resumed · ${priorTurns} prior turns summarized` : 'AI coding assistant';
    return(
        <Box flexDirection="column" marginBottom={1}>
            <Box marginBottom={1}>
               <Box width={4}><Text color={colors.amber} bold>g</Text></Box>
                <Box flexDirection="column" flexGrow={1}>
                    <Text color={colors.ink} bold>Welcome back, {name}.</Text>
                    <Text color={colors.muted}>{subtitle}</Text>
                </Box>
                <Text color={colors.muted}>v{version}</Text>
            </Box>
            <Card title="Workspace" badge="indexed">
                <InfoRow label="path"><Text color={colors.ink}>{workspace.path}</Text></InfoRow>
                <InfoRow label="branch"><Text color={colors.ink}>{workspace.branch}</Text></InfoRow>
                <InfoRow label="files">
                    <Text color={colors.ink}>
                        {workspace.files}{workspace.loc ? ` · ${workspace.loc}` : ''}
                    </Text>
                </InfoRow>
            </Card>
            <Card title="Runtime">
                <InfoRow label="model">
                    <Text color={colors.ink}>{runtime.model}</Text>
                    {runtime.routerOn && <Text color={colors.amber}>  [router on]</Text>}
                </InfoRow>
                <InfoRow label="tools"><Text color={colors.ink}>{runtime.toolsCount} enabled</Text></InfoRow>
                <InfoRow label="explain">
                    <Text color={colors.ink}>{runtime.explainOn ? 'on' : 'off'}</Text>
                    {!runtime.explainOn && <Text color={colors.muted}> · pass -e to enable</Text>}
                </InfoRow>
            </Card>
            <Box flexDirection="column" paddingX={1}>
                <QuickHelp cmd="/help"  desc="List commands and shortcuts" />
                <QuickHelp cmd="/model" desc="Show or switch the active model" />
                <QuickHelp cmd="/tools" desc="List available tools" />
                <QuickHelp cmd="/clear" desc="Clear current session" />
                <QuickHelp cmd="/exit"  desc="Save summary and quit" />
            </Box>
        </Box>
    )
}

const QuickHelp = ({ cmd, desc }: { cmd: string; desc: string }) => (
    <Box>
        <Box width={10}><Text color={colors.amber} bold>{cmd}</Text></Box>
        <Text color={colors.muted}>{desc}</Text>
    </Box>
);


