import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {getProcess,killProcess} from "./processRegistry.js";



export const readBackgroundOutputTool = tool(
    async({handle,kill})=>{
        const entry = getProcess(handle);
        if(!entry) return `No background process with handle: ${handle}`;
        const parts:string[] = [
            `Command: ${entry.command}`,
            `Started: ${entry.startedAt.toISOString()}`,
            `Status: ${entry.exitCode !== null ? `exited (exit code ${entry.exitCode})`: `still runing`}`
        ];
        if (entry.stdout) parts.push(`stdout:\n${entry.stdout}`);
        if (entry.stderr) parts.push(`stderr:\n${entry.stderr}`);
        if(kill) {
            killProcess(handle);
            parts.push('process killed.');
        }
        return parts.join('\n\n');
    },
    {
        name: 'read_background_output',
        description: 'Read accumulated stdout/stderr from a background process started with bash runInBackground:true. Use the handle returned at start time. Optionally kill the process.',
        schema: z.object({
            handle: z.string().describe('Handle returned when the process was started, e.g. "bg_1"'),
            kill: z.boolean().optional().describe('If true, kill the process after reading its output')
        })
    }
)