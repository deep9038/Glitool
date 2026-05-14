import {spawn } from 'child_process'
import fs from 'fs'



export type ValidationResult = {
    tsc:    { ok: boolean; errors: string[] };
    eslint: { ok: boolean; errors: string[]; ran: boolean };
    overallOk: boolean;
};



interface RunResult{
    ok:boolean;
    stdout: string;
    stderr: string;
}


function runCommand(cmd: string, args: string[],timeoutMs = 60_000):Promise<RunResult>{

    return new Promise(resolve => {
        const proc = spawn(cmd,args,{
            cwd: process.cwd(),
            timeout:timeoutMs,
            shell: true
        });


        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', d => { stdout += d.toString(); });
        proc.stderr?.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => resolve({ ok: code === 0, stdout, stderr }));
        proc.on('error', err  => resolve({ ok: false, stdout, stderr: err.message }));
    });
}




function hasEslintConfig(): boolean{
    return[
        '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs',
        '.eslintrc.yml', '.eslintrc.yaml',
        'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
    ].some(f => fs.existsSync(f));
}



function hasTsConfig(): boolean{
    return fs.existsSync('tsconfig.json');
}



const MAX_ERROR_LINES = 30;

export async function runValidator(): Promise<ValidationResult>{
    const result: ValidationResult = {
        tsc:    { ok: true, errors: [] },
        eslint: { ok: true, errors: [], ran: false },
        overallOk: true,
    };

    if (hasTsConfig()) {
        const tscRes = await runCommand('npx', ['tsc', '--noEmit']);
        if (!tscRes.ok) {
            const lines = (tscRes.stdout + tscRes.stderr)
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && /error TS\d+/i.test(l));
            result.tsc = { ok: false, errors: lines.slice(0, MAX_ERROR_LINES) };
        }
    }



    if (hasEslintConfig()) {
        result.eslint.ran = true;
        const eslintRes = await runCommand('npx', ['eslint', '.', '--format', 'compact']);
        if (!eslintRes.ok) {
            const lines = (eslintRes.stdout + eslintRes.stderr)
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith('npm '))
                .filter(l => /error|warning/i.test(l));
            result.eslint = { ok: false, errors: lines.slice(0, MAX_ERROR_LINES), ran: true };
        }
    }
    result.overallOk = result.tsc.ok && result.eslint.ok;
    return result;
}

export function formatValidationErrors(v: ValidationResult): string {
    const parts: string[] = [];
    if (!v.tsc.ok) {
        parts.push(`TypeScript errors:\n${v.tsc.errors.join('\n')}`);
    }
    if (!v.eslint.ok) {
        parts.push(`ESLint errors:\n${v.eslint.errors.join('\n')}`);
    }
    return parts.join('\n\n');
}