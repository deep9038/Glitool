import { tool } from "@langchain/core/tools";
import { confirm } from "@inquirer/prompts";
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { requestConfirm } from "../confirmHandler.js";


export const writeFileTool = tool(

    async({filePath, content})=>{
        const projectRoot = process.cwd();
        const fullPath = path.resolve(projectRoot,filePath);

        if(!fullPath.startsWith(projectRoot + path.sep) && fullPath !== projectRoot){
            throw new Error('Access denied: cannot write outside project root');
        }
        console.log(`\n📄 Write to: ${filePath}`);
        console.log('_'.repeat(40));
        console.log(content.slice(0,500) + (content.length > 500 ? '\n...(truncated)' : ''));
        console.log('_'.repeat(40));
        const ok = await requestConfirm(`Write to: ${filePath}?`);
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