import { tool } from "@langchain/core/tools";
import { spawn } from "child_process";
import { z } from "zod";
import { requestConfirm } from "../confirmHandler.js";
import { scoreShellRisk } from "../trust/riskScorer.js";
import { registerProcess } from "./processRegistry.js";
import path from 'path';

const MAX_OUTPUT = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export const bashTool = tool(
    async ({ command, timeout, runInBackground, cwd }) => {
        const timeoutMs: number = typeof timeout === 'string' ? parseInt(timeout, 10) : (timeout ?? DEFAULT_TIMEOUT_MS);
        const bgMode: boolean = typeof runInBackground === 'string' ? runInBackground === 'true' : (runInBackground ?? false);

        const risk = scoreShellRisk(command);

        if (risk === 'block') {
            return `BLOCKED: This shell command is too dangerous to run: \`${command}\`. Try a safer alternative or ask the user to run it manually.`;
        }

        if (risk === 'confirm') {
            const ok = await requestConfirm({
                type: 'write',
                filePath: `[shell] ${command}`,
                content: command,
                risk: 'medium',
            });
            if (!ok) {
                return 'USER_CANCELLED: The user rejected this shell command. Do NOT retry.';
            }
        }

        const proc = spawn(command, {
            shell: true,
            cwd: cwd ? path.resolve(process.cwd(), cwd) : process.cwd(),
            ...(bgMode ? {} : { timeout: timeoutMs }),
        })


        if(bgMode){
            const handle = registerProcess(proc,command);
            return `Background process started. Handle: ${handle}. Use the read_background_output with this handle to see output.`;
        }

        // Run the command
        return new Promise<string>((resolve) => {
            let stdout = '';
            let stderr = '';
            let truncated = false;

            // const proc = spawn(command, {
            //     shell: true,
            //     cwd: process.cwd(),
            //     timeout: timeout ?? DEFAULT_TIMEOUT_MS,
            // });

            proc.stdout?.on('data', (data)=>{
                if (stdout.length >= MAX_OUTPUT) {truncated = true; return;}
                stdout += data.toString();
                if (stdout.length > MAX_OUTPUT) {
                    stdout = stdout.slice(0,MAX_OUTPUT); 
                    truncated = true;
                }
            })



 
            proc.stderr?.on('data', (data) => {
                if (stderr.length >= MAX_OUTPUT) { truncated = true; return; }
                stderr += data.toString();
                if (stderr.length > MAX_OUTPUT) {
                    stderr = stderr.slice(0, MAX_OUTPUT);
                    truncated = true;
                }
            });

            proc.on('close', (code) => {
                const parts: string[] = [];
                if (stdout) parts.push(`stdout:\n${stdout}`);
                if (stderr) parts.push(`stderr:\n${stderr}`);
                parts.push(`exit code: ${code}`);
                if (truncated) parts.push('(output truncated at 10KB)');
                resolve(parts.join('\n\n'));
            });

            proc.on('error', (err) => {
                resolve(`Error running command: ${err.message}`);
            });
        });
    },
    {
        name: 'bash',
        description: 'Run a shell command. Use runInBackground:true for dev servers and long-running tests — returns a handle immediately. Use read_background_output to read accumulating output. Dangerous commands (rm -rf, sudo, fork bombs) are blocked. Sensitive commands (git push, npm install/publish) require user confirmation.',
        schema: z.object({
            command: z.string().describe('Shell command to run'),
            timeout: z.union([z.number(), z.string()]).optional().describe('Timeout in ms for foreground commands (default 30000)'),
            runInBackground: z.union([z.boolean(), z.string()]).optional().describe('If true, run in background and return a handle'),
            cwd: z.string().optional().describe('Working directory relative to project root'),
        }),

    }
);
