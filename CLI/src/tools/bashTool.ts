import { tool } from "@langchain/core/tools";
import { spawn } from "child_process";
import { z } from "zod";
import { requestConfirm } from "../confirmHandler.js";
import { scoreShellRisk } from "../trust/riskScorer.js";
import { registerProcess } from "./processRegistry.js";


const MAX_OUTPUT = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export const bashTool = tool(
    async ({ command, timeout,runInBackground}) => {
        // Risk check BEFORE spawn — block dangerous, confirm sensitive
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

        const proc = spawn(command,{
            shell: true,
            cwd: process.cwd(),
            ...(runInBackground ? {} : {timeout: timeout ?? DEFAULT_TIMEOUT_MS }),
        })


        if(runInBackground){
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
            timeout: z.number().optional().describe('Timeout in ms for foreground commands (default 30000)'),
            runInBackground: z.boolean().optional().describe('If true, run without waiting and return a handle'),
        }),
    }
);
