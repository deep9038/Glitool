import { tool } from '@langchain/core/tools';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import fg from 'fast-glob';



const SEARCH_IGNORE = [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.git/**',
    '.next/**',
    'coverage/**',
];


const MAX_BYTES   = 40_000;   // refuse files larger than this outright
const MAX_OUTPUT  = 12_000;   // truncate returned content to keep history compact




async function resolveFilePath(filePath: string): Promise<
    | { kind: 'ok'; absPath: string; resolvedFrom?: string }
    | { kind: 'not_found' }
    | { kind: 'ambiguous'; matches: string[] }
> {
    const cwd = process.cwd();

    // 1. Try the exact path the user gave us (against cwd).
    const direct = path.resolve(cwd, filePath);
    if (direct.startsWith(cwd) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
        return { kind: 'ok', absPath: direct };
    }

    // 2. If the user passed a path with slashes, don't search — they meant a specific location.
    if (filePath.includes('/') || filePath.includes('\\')) {
        return { kind: 'not_found' };
    }

    // 3. Bare filename — search for it anywhere in the project.
    const matches = await fg(`**/${filePath}`, {
        cwd,
        ignore: SEARCH_IGNORE,
        dot: false,
        onlyFiles: true,
        suppressErrors: true,
    });

    if (matches.length === 0) return { kind: 'not_found' };
    if (matches.length === 1) {
        return {
            kind: 'ok',
            absPath: path.resolve(cwd, matches[0]),
            resolvedFrom: matches[0],
        };
    }
    return { kind: 'ambiguous', matches };
}





export const readFileTool = tool(
    async ({ filePath, path: pathAlias, filename }) => {
        const resolvedPath = filePath ?? pathAlias ?? filename ?? '';
        const resolved = await resolveFilePath(resolvedPath);

        if (resolved.kind === 'not_found') {
            return `File not found: ${resolvedPath}
Current working directory: ${process.cwd()}
Hint: try a bare filename (e.g. "agent.ts") to search the whole project, or use an absolute path.`;
        }

        if (resolved.kind === 'ambiguous') {
            const list = resolved.matches.slice(0, 10).map(m => `  - ${m}`).join('\n');
            const more = resolved.matches.length > 10
                ? `\n  ...and ${resolved.matches.length - 10} more`
                : '';
            return `Multiple files match "${resolvedPath}":\n${list}${more}\n\nCall readFile again with one of these specific paths.`;


        }

        const stat = fs.statSync(resolved.absPath);
        if (stat.size > MAX_BYTES) {
            return `File too large (${stat.size.toLocaleString()} bytes). Use searchCode to find specific symbols, or read smaller files.`;
        }

        const raw = fs.readFileSync(resolved.absPath, 'utf-8');

        // Cap returned content. Slice on a line boundary so the model isn't given a half-line.
        let content = raw;
        let truncationNote = '';
        if (raw.length > MAX_OUTPUT) {
            const cut = raw.slice(0, MAX_OUTPUT);
            const lastNewline = cut.lastIndexOf('\n');
            content = lastNewline > 0 ? cut.slice(0, lastNewline) : cut;
            const droppedBytes = raw.length - content.length;
            const totalLines   = raw.split('\n').length;
            const shownLines   = content.split('\n').length;
            truncationNote = `\n\n[...truncated ${droppedBytes.toLocaleString()} bytes, showing ${shownLines}/${totalLines} lines. Use searchCode to find specific symbols, or read again with a more specific path.]`;
        }

        // If we resolved a bare filename, tell the agent which path we used so future calls can be precise.
        if (resolved.resolvedFrom) {
            return `[resolved "${resolvedPath}" → ${resolved.resolvedFrom}]\n\n${content}${truncationNote}`;
        }
        return content + truncationNote;
    },
    {
        name: 'readFile',
        description: 'Read the contents of a file. Accepts either a relative path from the project root (e.g. "src/foo.ts") or a bare filename (e.g. "foo.ts") — if a bare name is given, it searches the whole project. If multiple files match, the tool returns the list and you should call again with the specific path.',
        schema: z.object({
            filePath: z.string().optional().describe('Relative path or bare filename to read'),
            path: z.string().optional(),
            filename: z.string().optional(),
        }),

    }
);