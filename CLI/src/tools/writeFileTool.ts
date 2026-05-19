import { tool } from "@langchain/core/tools";
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { requestConfirm } from "../confirmHandler.js";
import { log } from "../logger.js";


export const writeFileTool = tool(

    async({filePath, content})=>{
        const projectRoot = process.cwd();
        const fullPath = path.resolve(projectRoot,filePath);

        if(!fullPath.startsWith(projectRoot + path.sep) && fullPath !== projectRoot){
            throw new Error('Access denied: cannot write outside project root');
        }
        log('write:before-confirm', { filePath });
        const ok = await requestConfirm({
            type: 'write',
            filePath,
            content,
            risk: 'medium',
        });
        log('write:after-confirm', { filePath, ok });

        if(!ok){
            return 'USER_CANCELLED: The user explicitly rejected this file write. Do NOT retry. Inform the user the write was cancelled.';
        }
        fs.mkdirSync(path.dirname(fullPath), { recursive: true});
        fs.writeFileSync(fullPath, content, 'utf-8');
        return `File written: ${filePath}`;
    },
    {
        name: 'writeFile',
        description: 'Create or overwrite a file with the given content. Always use editFile for modifying existing files - only use this to creat new files or completely replace files. Provide the relative file path and the full content to write.',
        schema: z.object({
            filePath: z.string().describe('Relative path to the file from the project root. For example: src/utils/helpers.ts'),
            content: z.string().describe('The full content to write to the file. The agent should provide the complete content of the file, not just the changes. Use editFile for making targeted edits to existing files.')
        })
    }
)