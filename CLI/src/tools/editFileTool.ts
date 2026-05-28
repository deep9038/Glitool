import { tool } from '@langchain/core/tools';
import fs from 'fs';
import path from 'path';
import {z} from 'zod';
import { requestConfirm } from '../confirmHandler.js';


export const editFileTool = tool(
    async({filePath, path: pathAlias, filename, oldString, newString})=>{
        const resolvedPath = filePath ?? pathAlias ?? filename ?? '';
        if (!resolvedPath) {
            throw new Error('editFile requires filePath. To write a whole file, use writeFile instead.');
        }

        const fullPath = path.resolve(process.cwd(), resolvedPath);

        if(!fullPath.startsWith(process.cwd())){
            throw new Error('Access denied: outside project root');
        }

        if(!fs.existsSync(fullPath)){
            throw new Error(`File not found: ${resolvedPath}`)
        }

        const content = fs.readFileSync(fullPath,'utf-8');

        if(!content.includes(oldString)){
            throw new Error(`String not found in file. Make sure oldString matches exactly, including whitespace and case.`);
        }

        const ok = await requestConfirm({
            type: 'edit',
            filePath: resolvedPath,
            oldString,
            newString,
            risk: 'low',
        });
        if(!ok){
            return 'USER_CANCELLED: The user explicitly rejected this file edit. Do NOT retry. Inform the user the edit was cancelled.'
        }

        const update = content.split(oldString).join(newString);
        fs.writeFileSync(fullPath,update,'utf-8');
        return `Successfully edited ${resolvedPath}`
    },
    {
        name: 'editFile',
        description: 'Make a targeted edit to an existing file by replacing an exact string. Use readFile first to get the current content, then provide the exact oldString to replace. To CREATE or fully OVERWRITE a file, use writeFile instead — editFile only modifies existing content.',
        schema: z.object({
            filePath: z.string().optional().describe('Relative path to the file from the project root'),
            path: z.string().optional(),
            filename: z.string().optional(),
            oldString: z.string().describe('The exact string to find and replace - must match exactly including whitespace and indentation'),
            newString: z.string().describe('The string to replace it with')
        })
    }
)
