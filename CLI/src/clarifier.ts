import { makeLlm } from './llm/factory.js';
import { searchCodeTool } from './tools/index.js';
import { emit } from './monitor.js';

const SKIP_DOMAINS = new Set(['chat','explanation']);

const UI_SEARCH_MAP: Record<string, string> = {
    button: 'onClick',
    btn: 'onClick',
    click: 'onClick',
    pressed: 'onClick',
    form: 'onSubmit',
    submit: 'onSubmit',
    login: 'login',
    signin: 'signIn',
    signup: 'signUp',
    register: 'register',
    modal: 'modal',
    dialog: 'dialog',
    dropdown: 'dropdown',
    menu: 'menu',
    cart: 'addToCart',
    checkout: 'checkout',
    payment: 'payment',
    search: 'handleSearch',
    filter: 'filter',
    upload: 'upload',
    delete: 'delete',
    save: 'save',
    update: 'update',
};

function extractSearchTerms(prompt: string): string[] {
    const terms: string[] = [];
    const lower = prompt.toLowerCase();

    for (const match of prompt.matchAll(/\b[\w/.-]+\.(tsx?|jsx?|css|html|json|md)\b/gi)) {
        terms.push(match[0]);
    }
    for (const match of prompt.matchAll(/\b[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/g)) {
        terms.push(match[0]);
    }
    for (const [word, searchTerm] of Object.entries(UI_SEARCH_MAP)) {
        if (lower.includes(word)) {
            terms.push(searchTerm);
        }
    }

    return [...new Set(terms)].slice(0, 4);
}

async function codebaseSearch(prompt: string): Promise<string> {
    const lower = prompt.toLowerCase();
    const isUiQuery = ['button', 'btn', 'click', 'form', 'input', 'modal', 'dropdown', 'link']
        .some(w => lower.includes(w));

    const terms = extractSearchTerms(prompt);
    const sections: string[] = [];

    for (const term of terms) {
        try {
            const raw = await (searchCodeTool as any).invoke({ keyword: term });
            if (!raw || raw === 'No matches found.') continue;

            const fileMap = new Map<string, string[]>();
            for (const line of raw.split('\n').filter(Boolean)) {
                const m = line.match(/^([^:]+):(\d+):(.*)/);
                if (!m) continue;
                const [, file, lineNum, content] = m;

                // For UI queries, skip pure .ts backend files
                if (isUiQuery && /\.ts$/.test(file) && !(/\.tsx$/.test(file))) continue;

                if (!fileMap.has(file)) fileMap.set(file, []);
                if (fileMap.get(file)!.length < 2) {
                    fileMap.get(file)!.push(`L${lineNum}: ${content.trim().slice(0, 80)}`);
                }
            }

            if (fileMap.size === 0) continue;

            const summary = [`[found "${term}" in ${fileMap.size} file(s)]`];
            let count = 0;
            for (const [file, snippets] of fileMap) {
                if (count++ >= 6) break;
                summary.push(`${file}:`);
                snippets.forEach(s => summary.push(`  ${s}`));
            }
            sections.push(summary.join('\n'));
        } catch {}
    }

    return sections.join('\n\n');
}

export interface ClarifierResult {
    questions: string[];
    codeContext?: string;
}

export async function runClarifier(prompt: string, domain: string): Promise<ClarifierResult> {
    if (SKIP_DOMAINS.has(domain)) return { questions: [], codeContext: undefined };


    const hasAnaphora = /\b(that|it|this|the issue|the bug|the problem|the fix|the error|the feature)\b/i.test(prompt);
    const isShortFollowUp = prompt.trim().split(/\s+/).length < 10 && hasAnaphora;
    if (isShortFollowUp) return { questions: [], codeContext: undefined };

    const mentionsSpecific =
        /\b[\w/.-]+\.(tsx?|jsx?|css|html|json|md)\b/gi.test(prompt) ||
        /\b[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/.test(prompt);
    if (mentionsSpecific) {
        const codeContext = await codebaseSearch(prompt);
        return { questions: [], codeContext: codeContext || undefined };
    }


    const codeContext = await codebaseSearch(prompt);
    const llm = makeLlm('meta-llama/Llama-3.3-70B-Instruct-Turbo');

    const systemPrompt = `You are a pre-execution clarifier for an AI coding assistant.

Your job: identify what is GENUINELY UNCLEAR before the agent runs, using only real codebase evidence.

══════════════════════════════════════════
PRIORITY RULES — apply in order, stop at first match
══════════════════════════════════════════

1. UI ELEMENTS (button, link, form, input, dropdown, modal):
   - ONLY look at .html, .tsx, .jsx results — ignore .ts backend/service files entirely
   - If ONE matching UI element is found in HTML/TSX → return {"questions": []}
   - If MULTIPLE UI elements match → ask which one with lettered options (real files only)

2. SPECIFIC request (mentions exact file, function, component, or line):
   - Return {"questions": []}

3. VAGUE request with multiple real candidates:
   - Ask maximum 3 questions, each covering one genuine unknown
   - Include lettered options using ONLY locations from the search results
   - Never ask what a senior developer would reasonably assume

4. NO search results found:
   - Ask one open general question, no fabricated options

══════════════════════════════════════════
STRICT RULES
══════════════════════════════════════════
- NEVER invent file names, component names, or line numbers
- ONLY reference locations that appear in the search results below
- Return ONLY valid JSON — no markdown, no explanation

Return: {"questions": ["...", "...", "..."]}
If clear enough to act on: {"questions": []}`;



    const userMessage = `Domain: ${domain}
Request: "${prompt}"
${codeContext
    ? `Codebase search results (ONLY use these for options):\n${codeContext}`
    : `Codebase search results: NONE FOUND — do not invent file names, ask general questions only.`
}

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

        return {  questions, codeContext: codeContext || undefined  };
    } catch {
        return { questions: [], codeContext: codeContext || undefined };
    }
}

export function buildEnhancedPrompt(original: string, answers: string): string {
    return `[Original request]: ${original}\n\n[User clarification]: ${answers}`;
}
