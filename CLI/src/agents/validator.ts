import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';

export type ValidationResult = {
    tsc:    { ok: boolean; errors: string[]; ran: boolean };
    eslint: { ok: boolean; errors: string[]; ran: boolean };
    overallOk: boolean;
};

interface RunResult { ok: boolean; stdout: string; stderr: string; }

function runCommand(cmd: string, args: string[], cwd: string, timeoutMs = 60_000): Promise<RunResult> {
    return new Promise(resolve => {
        const proc = spawn(cmd, args, { cwd, timeout: timeoutMs, shell: true });
        let stdout = '', stderr = '';
        proc.stdout?.on('data', d => { stdout += d.toString(); });
        proc.stderr?.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => resolve({ ok: code === 0, stdout, stderr }));
        proc.on('error', err => resolve({ ok: false, stdout, stderr: err.message }));
    });
}

async function findTsConfigs(): Promise<string[]> {
    // Walk down from cwd (max 2 levels deep) to find tsconfig.json files,
    // ignoring node_modules / dist / .next / .git
    return fg(['tsconfig.json', '*/tsconfig.json', '*/*/tsconfig.json'], {
        cwd: process.cwd(),
        ignore: ['node_modules/**', 'dist/**', '.next/**', '.git/**', 'build/**'],
        onlyFiles: true,
        suppressErrors: true,
    });
}

async function findEslintConfigs(): Promise<string[]> {
    return fg([
        '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js',
        '*/.eslintrc.json', '*/.eslintrc.js', '*/eslint.config.js',
    ], {
        cwd: process.cwd(),
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        onlyFiles: true,
        suppressErrors: true,
    });
}

const MAX_ERROR_LINES = 30;

export async function runValidator(): Promise<ValidationResult> {
    const result: ValidationResult = {
        tsc:    { ok: true, errors: [], ran: false },
        eslint: { ok: true, errors: [], ran: false },
        overallOk: true,
    };

    const tsConfigs = await findTsConfigs();
    if (tsConfigs.length === 0) {
        // No TS project found — this is suspicious. Mark validator as not-actually-run.
        result.tsc = { ok: false, errors: ['No tsconfig.json found anywhere in the project. Validator cannot verify TypeScript output.'], ran: false };
        result.overallOk = false;
        return result;
    }

    for (const cfg of tsConfigs) {
        result.tsc.ran = true;
        const projectDir = path.dirname(path.resolve(process.cwd(), cfg));
        const tscRes = await runCommand('npx', ['tsc', '--noEmit'], projectDir);
        if (!tscRes.ok) {
            const lines = (tscRes.stdout + tscRes.stderr)
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && /error TS\d+/i.test(l));
            if (lines.length > 0) {
                result.tsc.ok = false;
                result.tsc.errors.push(`[${cfg}]`, ...lines.slice(0, MAX_ERROR_LINES));
            }
        }
    }

    const eslintConfigs = await findEslintConfigs();
    for (const cfg of eslintConfigs) {
        result.eslint.ran = true;
        const projectDir = path.dirname(path.resolve(process.cwd(), cfg));
        const eslintRes = await runCommand('npx', ['eslint', '.', '--format', 'compact'], projectDir);
        if (!eslintRes.ok) {
            const lines = (eslintRes.stdout + eslintRes.stderr)
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith('npm '))
                .filter(l => /error|warning/i.test(l));
            if (lines.length > 0) {
                result.eslint.ok = false;
                result.eslint.errors.push(`[${cfg}]`, ...lines.slice(0, MAX_ERROR_LINES));
            }
        }
    }

    result.overallOk = result.tsc.ok && result.eslint.ok && result.tsc.ran;
    return result;
}

export function formatValidationErrors(v: ValidationResult): string {
    const parts: string[] = [];
    if (!v.tsc.ran) parts.push('No tsconfig found — TypeScript was not validated. Treat output as UNVERIFIED.');
    if (!v.tsc.ok) parts.push(`TypeScript errors:\n${v.tsc.errors.join('\n')}`);
    if (!v.eslint.ok) parts.push(`ESLint errors:\n${v.eslint.errors.join('\n')}`);
    return parts.join('\n\n');
}
