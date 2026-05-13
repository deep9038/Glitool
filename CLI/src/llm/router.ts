import { loadConfig } from "../config.js";
export type TaskComplexity = 'simple'| 'complex';
export type TaskTier = 'quick' | 'standard' | 'complex';
export type TaskDomain = 'chat' | 'coding' |  'explanation'  |  'planning';


export interface RouteDecision {
    tier: TaskTier;
    domain: TaskDomain;
    complexityScore: number;
    recommendedModel: string;
    reason: string;
    source: 'regex' | 'explicit';
    confidence: 'high' | 'low';   // ← NEW
}







const MODEL_BY_TIER: Record<TaskTier, string> = {
    quick:    'gpt-4o-mini',
    standard: 'gpt-4o-mini',
    complex:  'gpt-4o',
};


const ANAPHORA_PATTERNS = [
    /\b(this|that|it|those|these)\b/i,
    /\b(again|instead|previous|prior)\b/i,
];


const VAGUE_IMPERATIVES = [
    /^(do it|fix it|redo|undo|keep going|continue|proceed|go ahead)\b/i,
];


const CHAT_PATTERNS = [
    /^(hi|hello|hey|thanks|thank you|ok|sure|yes|no|great|awesome)\b/i,
    /^\/\w+/,
]

const EXPLANATION_PATTERNS = [
    /^(explain|describe|what is|what are|tell me about|how does|why does|what does)\s/i,
    /^(what|who|when|where|how|why)\s.{0,60}\?$/i,
];


const CODING_PATTERNS = [
    /refactor|rewrite|redesign/i,
    /implement|build|create|add|generate/i,
    /fix|debug|solve|resolve/i,
    /optimize|improve|upgrade/i,
    /migrate|convert|transform/i,
    /function|class|component|api|endpoint|hook|module/i,
];



const PLANNING_PATTERNS = [
    /architecture|design|system|scalab/i,
    /plan|roadmap|strategy|approach/i,
    /how should (i|we)|what.s the best way/i,
];

type ExplicitMap = Record<string, { domain: TaskDomain; tier: TaskTier }>;

const EXPLICIT_ROUTES: ExplicitMap = {
    '/plan':    { domain: 'planning',    tier: 'complex' },
    '/coder':   { domain: 'coding',      tier: 'standard' },
    '/quick':   { domain: 'chat',        tier: 'quick' },
    '/explain': { domain: 'explanation', tier: 'quick' },
};



function hasAnaphora(prompt: string): boolean {
    return ANAPHORA_PATTERNS.some(p => p.test(prompt))
        || VAGUE_IMPERATIVES.some(p => p.test(prompt));
}


export function parseExplicitRoute(prompt: string): RouteDecision | null {
    const trimmed = prompt.trim();
    for (const [cmd, route] of Object.entries(EXPLICIT_ROUTES)) {
        if (trimmed.startsWith(cmd + ' ') || trimmed === cmd) {
            return {
                tier: route.tier,
                domain: route.domain,
                complexityScore: 0,
                recommendedModel: getModel(route.tier),
                reason: `explicit: ${cmd}`,
                source: 'explicit',
                confidence: 'high',   // ← ADD
            };
        }
    }
    return null;
}


export function stripExplicitPrefix(prompt: string): string {
    const trimmed = prompt.trim();
    for (const cmd of Object.keys(EXPLICIT_ROUTES)) {
        if (trimmed.startsWith(cmd + ' ')) {
            return trimmed.slice(cmd.length + 1).trim();
        }
        if (trimmed === cmd) {
            return '';
        }
    }
    return prompt;
}




function getModel(tier: TaskTier):string{
    const userPref = loadConfig().preferredModel;
    if (userPref && userPref !== 'gpt-4o-mini') return userPref;
    return MODEL_BY_TIER[tier];
}


export function getModelForTier(tier: TaskTier): string {
    return MODEL_BY_TIER[tier];
}


function detectDomain(prompt: string): { domain: TaskDomain; matched: boolean } {
    if (CHAT_PATTERNS.some(p => p.test(prompt))) return { domain: 'chat', matched: true };
    if (EXPLANATION_PATTERNS.some(p => p.test(prompt))) return { domain: 'explanation', matched: true };
    if (CODING_PATTERNS.some(p => p.test(prompt))) return { domain: 'coding', matched: true };
    if (PLANNING_PATTERNS.some(p => p.test(prompt))) return { domain: 'planning', matched: true };
    return { domain: 'chat', matched: false };
}



function scoreComplexity(prompt: string):number {
    let score = 0;
    if (prompt.length > 300) score += 1;
    if (prompt.length > 800) score += 1;
    if (/```/.test(prompt)) score += 1;
    if ((prompt.match(/\n/g)?.length ?? 0) > 5) score += 1;
    if (PLANNING_PATTERNS.some(p => p.test(prompt))) score += 2;
    return score;
}

function selectTier(domain: TaskDomain, score: number): TaskTier{
    if(domain === 'chat') return 'quick';
    if (domain === 'explanation' && score <= 1) return 'quick';
    if (score >= 3 || domain === 'planning') return 'complex';
    return 'standard';
}

function computeConfidence(matched: boolean, promptLength: number, anaphora: boolean): 'high' | 'low' {
    // Anaphora needs context — never high confidence without LLM lookup
    if (anaphora) return 'low';

    // Very short prompts are usually clear: hi, ok, thanks
    if (promptLength < 20) return 'high';

    // Pattern matched → we know what this is
    if (matched) return 'high';

    // Long prompt, no pattern, no anaphora → we're guessing
    return 'low';
}


export function route(prompt: string): RouteDecision {
    const explicit = parseExplicitRoute(prompt);
    if (explicit) return explicit;

    const trimmed = prompt.trim();
    const { domain, matched } = detectDomain(trimmed);
    const complexityScore = scoreComplexity(trimmed);
    const tier = selectTier(domain, complexityScore);
    const anaphora = hasAnaphora(trimmed);
    const confidence = computeConfidence(matched, trimmed.length, anaphora);

    return {
        tier,
        domain,
        complexityScore,
        recommendedModel: getModel(tier),
        reason: `domain=${domain} score=${complexityScore} tier=${tier} matched=${matched} anaphora=${anaphora}`,
        source: 'regex',
        confidence,
    };
}



export function detectComplexity(message: string): TaskComplexity{
    const { domain, tier } = route(message);
    return (domain === 'coding' || tier === 'complex') ? 'complex': 'simple';
}