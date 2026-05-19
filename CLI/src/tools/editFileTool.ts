import { tool } from '@langchain/core/tools';
import fs from 'fs';
import path from 'path';
import {z} from 'zod';
import { requestConfirm } from '../confirmHandler.js';


export const editFileTool = tool(
    async({filePath,oldString,newString})=>{
        const fullPath = path.resolve(process.cwd(),filePath);

        if(!fullPath.startsWith(process.cwd())){
            throw new Error('Access denied: outside project root');
        }

        if(!fs.existsSync(fullPath)){
            throw new Error(`File not found: ${filePath}`)
        }

        const content = fs.readFileSync(fullPath,'utf-8');


        if(!content.includes(oldString)){
            throw new Error(`String not found in file. Make sure oldString matches exactly, including whitespace and case.`);
        }


        const ok = await requestConfirm({
            type: 'edit',
            filePath,
            oldString,
            newString,
            risk: 'low',
        });
        if(!ok){
            return 'USER_CANCELLED: The user explicitly rejected this file edit. Do NOT retry. Inform the user the edit was cancelled.'
        }

        const update = content.split(oldString).join(newString);
        fs.writeFileSync(fullPath,update,'utf-8');
        return `Successfully edited ${filePath}`
    },
    {
        name: 'editFile',
        description: 'Make a targeted edit to an existing file by replacing an exact string. Use readFile first to get the current content, then provide the exact oldString to replace.',
        schema: z.object({
            filePath: z.string().describe('Relative path to the file from the project root'),
            oldString: z.string().describe('The exact string to find and replace - must match exactly including whitespace and indentation'),
            newString: z.string().describe('The string to replace it with')
        })
    }
)