import React from "react";
import {Box,Text} from 'ink';
import { colors } from "./tokens.js";


export type Role = 'you' | 'glitool' | 'tools' | 'graph' | 'plan' | 'note';


const ROLE_COLOR: Record<Role,string> = {
    you: colors.amber,
    glitool: colors.ink2,
    tools: colors.violet,
    graph: colors.violet,
    plan: colors.sage,
    note: colors.muted
};



interface RoleRowProps{
    role: Role;
    timestamp?:string;
    children: React.ReactNode;
}


export const RoleRow = ({role,timestamp,children}:RoleRowProps)=>{
    const lable = timestamp ? `${role} . ${timestamp}` : role;


    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text color={ROLE_COLOR[role]} bold>
                {lable.toUpperCase()}
            </Text>
            <Box paddingLeft={2}>
                {children}
            </Box>
        </Box>
    )
}

