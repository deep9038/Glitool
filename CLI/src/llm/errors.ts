/**
 * Thrown by the fetch wrapper in factory.ts when the server returns
 * 429 token_limit_exceeded. Carries the server's friendly message and
 * the relevant URL so the UI can show them instead of LangChain's
 * generic "model rate limit" error.
 */
export class GlitoolTokenLimitError extends Error {
    readonly name = 'GlitoolTokenLimitError';
    readonly isGlitoolTokenLimit = true;

    constructor(
        public readonly tier:        'anon' | 'free' | 'pro',
        public readonly tokensUsed:  number,
        public readonly tokensLimit: number,
        public readonly friendlyMessage: string,
        public readonly signupUrl?:  string,
        public readonly upgradeUrl?: string,
    ) {
        super(friendlyMessage);
    }
}

export function isTokenLimitError(err: unknown): err is GlitoolTokenLimitError {
    return !!err && typeof err === 'object' && (err as any).isGlitoolTokenLimit === true;
}
