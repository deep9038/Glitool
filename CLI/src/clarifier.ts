import { searchCodeTool } from './tools/index.js';

const SKIP_DOMAINS = new Set(['chat', 'explanation', 'git']);

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

export interface ClarifierQuestion {
    question: string;
    options?: string[];
}

export interface ClarifierResult {
    codeContext?: string;
}

export async function runClarifier(prompt: string, domain: string, sessionMessageCount = 0): Promise<ClarifierResult> {
    if (SKIP_DOMAINS.has(domain)) return {};

    const words = prompt.trim().split(/\s+/);
    const isShort = words.length < 10;

    const hasAnaphora = /\b(that|it|this|the issue|the bug|the problem|the fix|the error|the feature)\b/i.test(prompt);
    const ACTION_VERBS = /^(do|implement|build|add|make|create|fix|run|apply|execute|start|generate|write|update|remove|delete|refactor)\b/i;
    const isActionOnDefinite = ACTION_VERBS.test(words[0]) && /\bthe\b/i.test(prompt);
    const isShortFollowUp = isShort && (hasAnaphora || (isActionOnDefinite && sessionMessageCount > 2));

    if (isShortFollowUp) return {};

    const codeContext = await codebaseSearch(prompt);
    return { codeContext: codeContext || undefined };
}

export function buildEnhancedPrompt(original: string, answers: string): string {
    return `[Original request]: ${original}\n\n[User clarification]: ${answers}`;
}
