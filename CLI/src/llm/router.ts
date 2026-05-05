export type TaskComplexity = 'simple'| 'complex';

const SIMPLE_PATTERNS = [
    /^(what|who|when|where|how|why)\s.{0,60}\?$/i,
    /^(explain|define|what is|what are|tell me about)\s/i,
    /^(hi|hello|hey|thanks|thank you)/i,
    /^\/\w+/,
];


const COMPLEX_PATTERNS = [
    /refactor|rewrite|redesign/i,
    /implement|build|create|add|generate/i,
    /fix|debug|solve|resolve/i,
    /optimize|improve|upgrade/i,
    /migrate|convert|transform/i,
];

export function detectComplexity(message: string): TaskComplexity {
    const trimmed = message.trim();
    for (const pattern of SIMPLE_PATTERNS) {
        if (pattern.test(trimmed)) return 'simple';
    }
    for (const pattern of COMPLEX_PATTERNS) {
        if (pattern.test(trimmed)) return 'complex';
    }
    return trimmed.length > 120 ? 'complex' : 'simple';
}