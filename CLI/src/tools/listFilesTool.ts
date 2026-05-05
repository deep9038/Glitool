import {tool} from '@langchain/core/tools'
import fs from 'fs'
import path from 'path'
import {z} from 'zod'



const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build','.next'];



function buildTree(dir:string, prefix = ''): string{
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    const lines: string[] = [];
    for ( const entry of entries){
        if (SKIP_DIRS.includes(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        lines.push(`${prefix}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
        if(entry.isDirectory()){
            const sub = buildTree(path.join(dir, entry.name), prefix + '  ');
            if(sub) lines.push(sub);
        }
    }
    return lines.join('\n');
}

export const listFilesTool = tool(
    async ()=> buildTree(process.cwd()),
    {
        name:'listFiles',
        description: 'Lists files and directories in the current working directory. It returns a tree-like structure with folders and files.',
        schema: z.object({})
    }
)
