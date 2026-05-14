import {tool} from '@langchain/core/tools'
import fs from 'fs'
import path from 'path'
import {z} from 'zod'
import fg from 'fast-glob'



const DEFAULT_IGNORE = ['node_modules/**','dist/**', 'build/**', '.git/**','.next/**'];


export const listFilesTool = tool(

    async ({pattern,ignore})=>{
        const files = await fg(pattern ?? '**/*',{
            cwd: process.cwd(),
            ignore: [...DEFAULT_IGNORE,...(ignore ?? [])],
            dot:false,
            onlyFiles:false,
            markDirectories:true
        });
        if(files.length === 0) return 'No files matched.';
        return files.join('\n');
    },
    {
        name:'listFiles',
        description:'List files in the current project. Accepts a glob pattern (e.g. "src/**/*.ts") to filter results. Returns matching file paths, one per line. Directories end with /.',
        schema: z.object({
            pattern: z.string().optional().describe('Glob pattern to filter files (default: **/* — everything). Examples: "src/**/*.ts", "**/*.test.ts", "*.json"'),
            ignore: z.array(z.string()).optional().describe('Additional glob patterns to ignore on top of the defaults (node_modules, dist, .git)')
        })
    }


)




