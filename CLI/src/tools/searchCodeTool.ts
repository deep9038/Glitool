import {tool} from "@langchain/core/tools";
import {execFileSync } from "child_process";
import {z} from "zod";



export const searchCodeTool = tool(
    async ({ keyword, query }) => {
        const searchTerm = keyword ?? query ?? '';
        try{
            const result = execFileSync(
                'grep',
                [
                    '-rn',
                    searchTerm,
                    '--include=*.ts',
                    '--include=*.tsx',
                    '--include=*.js',
                    '--include=*.jsx',
                    '--include=*.html',
                    '--include=*.json',
                    '--exclude-dir=node_modules',
                    '--exclude-dir=dist',
                    '--exclude-dir=.git',
                    '.'
                ],
                { cwd: process.cwd(), timeout: 10000, stdio: 'pipe' }
            ).toString();

            return result || 'No matches found.';
        }catch {
            return 'No matches found.';
        }
    },
    {
        name: 'searchCode',
        description: 'Search for a keyword or function name across all project files. Returns file paths and line numbers where the keyword is found. Use this tool to quickly locate where a specific function or variable is used in the codebase.',
        schema: z.object({
            keyword: z.string().optional().describe('The keyword, function name, or pattern to search for'),
            query: z.string().optional(),
        })
 
    }
)