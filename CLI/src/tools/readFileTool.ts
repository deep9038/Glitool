import {tool} from  '@langchain/core/tools'
import fs from 'fs';
import path from 'path';
import {z} from 'zod';


export const readFileTool = tool(
    async ({filePath}) =>{
        const fullPath = path.resolve(process.cwd(),filePath);
        if(!fullPath.startsWith(process.cwd())){
            throw new Error('Access denied: outside of current working directory');
        }
        if(!fs.existsSync(fullPath)){
            throw new Error(`File not found: ${filePath}`);
        }
        return fs.readFileSync(fullPath,'utf-8');
    },
    {
        name: 'readFile',
        description: 'Reads the contents of a specific file. Use this tool to read the contents of a file in the current working directory. Provide the relative path to the file you want to read.',
        schema: z.object({
            filePath: z.string().describe('Relative path to the file from the project root')
        })
    }
)