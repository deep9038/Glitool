type AskUserFn = (question: string, options?: string[]) => Promise<string>;

let handler: AskUserFn = async () => '';

export function setClarificationHandler(fn: AskUserFn) {
    handler = fn;
}

export async function requestClarification(question: string, options?: string[]): Promise<string> {
    return handler(question, options);
}
