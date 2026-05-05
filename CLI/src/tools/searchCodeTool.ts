import {tool} from "@langchain/core/tools";
import {execSync} from "child_process";
import {z} from "zod";


export const searchCodeTool = tool(
    async({keyword})=>{
        try{
            const result = execSync(
                `grep -rn "${keyword}" --include="*.ts" --include="*.js" --include="*.json" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist --exclude-dir=.git`,
                { cwd: process.cwd(),timeout:10000, stdio:'pipe' }
            ).toString();
            return result || 'No Matches found.';
        }catch{
            return 'No matches found.'
        }
    },
    {
        name:'searchCode',
        description:'Search for a keyword or function name across all project files. Returns file paths and line numbers where the keyword is found. Use this tool to quickly locate where a specific function or variable is used in the codebase.',
        schema: z.object({
            keyword: z.string().describe('The Keyword, funtion name, or pattern to search for in the codebase')
        })
    }
);