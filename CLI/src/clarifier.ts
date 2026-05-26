import { makeLlm } from './llm/factory.js';
import { readFileTool } from './tools/index.js';
import { emit } from './monitor.js';

const SKIP_DOMAINS = new Set(['chat']);

function extractFileHints(prompt: string): string[] {
    const hits: string[] = [];
    for (const match of prompt.matchAll(/\b[\w/.-]+\.(tsx?|jsx?|css|html|json|md)\b/gi)) {
        hits.push(match[0]);
    }
    for (const match of prompt.matchAll(/\b[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/g)) {
        hits.push(match[0]);
    }
    return [...new Set(hits)].slice(0, 4);
}

async function quickScan(prompt: string): Promise<string> {
    const hints = extractFileHints(prompt);
    const snippets: string[] = [];
    for (const hint of hints) {
        try {
            const raw = await (readFileTool as any).invoke({ filePath: hint });
            if (typeof raw === 'string' && !raw.toLowerCase().includes('not found')) {
                snippets.push(`--- ${hint} ---\n${raw.slice(0, 600)}`);
                if (snippets.length >= 2) break;
            }
        } catch {}
    }
    return snippets.join('\n\n');
}

export interface ClarifierResult {
    questions: string[];
}

export async function runClarifier(prompt: string, domain: string): Promise<ClarifierResult> {
    if (SKIP_DOMAINS.has(domain)) return { questions: [] };

    const codeContext = await quickScan(prompt);
    const llm = makeLlm('meta-llama/Llama-3.3-70B-Instruct-Turbo');

    const systemPrompt = `You are a pre-execution clarifier for an AI coding assistant.

Analyze the user's request and identify what is GENUINELY UNCLEAR that would cause the agent to go in the wrong direction.

Rules:
- Do NOT ask about things visible in the provided code context
- Do NOT ask about obvious things determinable from the code
- If the request is clear enough to act on, return empty questions array
- Maximum 4 questions, each short and specific
- Return ONLY valid JSON — no explanation, no markdown

Return: {"questions": ["...", "..."]}`;

    const userMessage = `Domain: ${domain}
Request: "${prompt}"${codeContext ? `\n\nRelevant code:\n${codeContext}` : ''}

What is genuinely unclear?`;

    try {
        const response = await llm.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ]);

        const text = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { questions: [] };

        const parsed = JSON.parse(jsonMatch[0]);
        const questions: string[] = Array.isArray(parsed.questions)
            ? parsed.questions.filter((q: any) => typeof q === 'string').slice(0, 4)
            : [];

        return { questions };
    } catch {
        return { questions: [] };
    }
}

export function buildEnhancedPrompt(original: string, answers: string): string {
    return `[Original request]: ${original}\n\n[User clarification]: ${answers}`;
}
