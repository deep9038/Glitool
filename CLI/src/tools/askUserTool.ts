import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { requestClarification } from '../clarificationHandler.js';

export const askUserTool = tool(
    async ({ question, options }) => {
        const answer = await requestClarification(question, options);
        if (!answer || answer.trim() === 's' || answer.trim() === '/skip') {
            return 'User skipped. Use your best judgment and proceed with the most reasonable approach.';
        }
        return `User answered: ${answer}`;
    },
    {
        name: 'askUser',
        description: `Ask the user ONE question when you cannot proceed without their input.
ONLY call this after you have already investigated (read files, searched code).
ONLY when multiple real candidates exist in the code and you cannot determine which one.
Ask the most specific question possible based on what you actually found.
Do NOT ask about design preferences, layout choices, or features — make sensible defaults.
Do NOT ask about things you can discover by reading files.`,
        schema: z.object({
            question: z.string().describe('The specific question to ask the user'),
            options: z.array(z.string()).optional().describe('2-4 choices based on what you found in the code. Omit for open questions.'),
        }),
    }
);
