import { tool } from "@langchain/core/tools";
import { spawn } from "child_process";
import { z } from "zod";
import { requestConfirm } from "../confirmHandler.js";
import { scoreShellRisk } from "../trust/riskScorer.js";

const MAX_OUTPUT = 10_000;        // 10KB per stream
const DEFAULT_TIMEOUT_MS = 30_000;

export const bashTool = tool(
    async ({ command, timeout }) => {
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

        // Run the command
        return new Promise<string>((resolve) => {
            const proc = spawn(command, {
                shell: true,
                cwd: process.cwd(),
                timeout: timeout ?? DEFAULT_TIMEOUT_MS,
            });

            let stdout = '';
            let stderr = '';
            let truncated = false;

            proc.stdout?.on('data', (data) => {
                if (stdout.length >= MAX_OUTPUT) { truncated = true; return; }
                stdout += data.toString();
                if (stdout.length > MAX_OUTPUT) {
                    stdout = stdout.slice(0, MAX_OUTPUT);
                    truncated = true;
                }
            });

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
        description: 'Run a shell command. Use for: type-checking (npx tsc --noEmit), linting (npx eslint), running tests, git status/diff/log, npm scripts, file inspection. Dangerous commands (rm -rf, sudo, fork bombs) are blocked. Sensitive commands (git push, npm install/publish) require user confirmation.',
        schema: z.object({
            command: z.string().describe('The shell command to run (must be a single command line, not a script)'),
            timeout: z.number().optional().describe('Timeout in milliseconds (default 30000)'),
        }),
    }
);
