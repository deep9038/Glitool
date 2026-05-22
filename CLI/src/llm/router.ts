import { classifyWithLlm } from './classifier.js';
import { loadConfig } from '../config.js';
import type { BaseMessage } from '@langchain/core/messages';
export type TaskComplexity = 'simple'| 'complex';
export type TaskTier = 'quick' | 'standard' | 'complex';
export type TaskDomain = 'chat' | 'coding' | 'explanation' | 'planning' | 'debugging' | 'refactoring' | 'review' | 'git';


export interface RouteDecision {
    tier: TaskTier;
    domain: TaskDomain;
    complexityScore: number;
    recommendedModel: string;
    reason: string;
    source: 'regex' | 'explicit' | 'llm' | 'regex-fallback';
    confidence: 'high' | 'low';
    regex_said?: TaskDomain;
    llm_said?: TaskDomain;
    escalation_reason?: string;
    latency_ms?: number;
    classifier_tokens?: number;
}








const MODEL_BY_TIER: Record<TaskTier, string> = {
    quick:    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    standard: 'Qwen/Qwen2.5-Coder-72B-Instruct',
    complex:  'deepseek-ai/DeepSeek-V3',
};



const ANAPHORA_PATTERNS = [
    /\b(this|that|it|those|these)\b/i,
    /\b(again|instead|previous|prior)\b/i,
];


const VAGUE_IMPERATIVES = [
    /^(do it|fix it|redo|undo|keep going|continue|proceed|go ahead)\b/i,
];


const CHAT_PATTERNS = [
    /^(hi+|hello|hey|thanks|thank you|ok|sure|yes|no|great|awesome)\b/i,
    /^\/\w+/,
]

const EXPLANATION_PATTERNS = [
    /^(explain|describe|what is|what are|tell me about|how does|why does|what does)\s/i,
    /^(what|who|when|where|how|why)\s.{0,60}\?$/i,
    /^(read|show|open|cat|view|display|print)\s+\S+\.\w+/i,
    /^(read|show|open|view)\s+(this|that|the)?\s*\S+/i,
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
    '/plan':     { domain: 'planning',     tier: 'complex' },
    '/coder':    { domain: 'coding',       tier: 'standard' },
    '/quick':    { domain: 'chat',         tier: 'quick' },
    '/explain':  { domain: 'explanation',  tier: 'quick' },
    '/debug':    { domain: 'debugging',    tier: 'standard' },
    '/refactor': { domain: 'refactoring',  tier: 'complex' },
    '/review':   { domain: 'review',       tier: 'standard' },
    '/git':      { domain: 'git',          tier: 'quick' },
};



const DEBUGGING_PATTERNS = [
    /\berror:/i,
    /\b(crash|crashes|crashed|crashing)\b/i,
    /\b(fail|fails|failed|failing)\b/i,
    /\b(broken|broke|breaks|breaking)\b/i,
    /\bfix this\b/i,
    /\b(exception|traceback|stack trace)\b/i,
    /\bnot working\b/i,
    /\bwhy (is|does|isn't|doesn't|did|won't)\b/i,
];

const REFACTORING_PATTERNS = [
    /\brefactor(ed|ing|s)?\b/i,
    /\bclean (this|it|up)\b/i,
    /\bsimplif(y|ied|ying|ies)\b/i,
    /\brestructur(e|ed|ing|es)\b/i,
    /\brenam(e|ed|ing|es)\b/i,
    /\bextract(ed|ing|s)?\b/i,
    /\breduc(e|ed|ing|es) duplication\b/i,
    /\bmake (this|it) more readable\b/i,
];

const REVIEW_PATTERNS = [
    /\breview(ed|ing|s)?\b/i,
    /\baudit(ed|ing|s)?\b/i,
    /\bcheck for (issues|bugs|problems|errors)\b/i,
    /\bis this (good|correct|right|ok|fine)\b/i,
    /\bsecurity (check|review|audit)\b/i,
    /\bcode review\b/i,
    /\blook (over|at) (this|my)\b/i,
];

const GIT_PATTERNS = [
    /\b(commit|commits|committed|committing)\b/i,
    /\bgit\b/i,
    /\bwhat (changed|was changed|got changed)\b/i,
    /\bstage[ds]?\b/i,
    /\bstaging\b/i,
    /\bpush(ed|ing|es)?\b/i,
    /\bpull(ed|ing|s)?\b/i,
    /\bbranch(es|ing|ed)?\b/i,
    /\bmerg(e|ed|ing|es)\b/i,
    /\brebas(e|ed|ing|es)\b/i,
    /\bcheckout\b/i,
    /\bdiff\b/i,
    /\bcommit message\b/i,
    /\b(repo|repository)\b/i,
];





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




function getModel(tier: TaskTier): string {
    const userPref = loadConfig().preferredModel;
    // User preference applies ONLY to the quick tier (chat/explain).
    // Coding, planning, refactoring always use the tier-appropriate strong model.
    if (userPref && tier === 'quick') return userPref;
    return MODEL_BY_TIER[tier];
}



export function getModelForTier(tier: TaskTier): string {
    return MODEL_BY_TIER[tier];
}


function detectDomain(prompt: string): { domain: TaskDomain; matched: boolean } {
    if (CHAT_PATTERNS.some(p => p.test(prompt)))        return { domain: 'chat',        matched: true };
    if (GIT_PATTERNS.some(p => p.test(prompt)))         return { domain: 'git',         matched: true };
    if (REVIEW_PATTERNS.some(p => p.test(prompt)))      return { domain: 'review',      matched: true };
    if (REFACTORING_PATTERNS.some(p => p.test(prompt))) return { domain: 'refactoring', matched: true };
    if (DEBUGGING_PATTERNS.some(p => p.test(prompt)))   return { domain: 'debugging',   matched: true };
    if (EXPLANATION_PATTERNS.some(p => p.test(prompt))) return { domain: 'explanation', matched: true };
    if (CODING_PATTERNS.some(p => p.test(prompt)))      return { domain: 'coding',      matched: true };
    if (PLANNING_PATTERNS.some(p => p.test(prompt)))    return { domain: 'planning',    matched: true };
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

function selectTier(domain: TaskDomain, score: number): TaskTier {
    if (domain === 'chat' || domain === 'git')                    return 'quick';
    if (domain === 'explanation' && score <= 1)                   return 'quick';
    if (domain === 'planning' || domain === 'refactoring')        return 'complex';
    if (score >= 3)                                               return 'complex';
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


export async function route(
    prompt: string,
    recentMessages: BaseMessage[] = []
): Promise<RouteDecision> {
    const start = Date.now();

    const explicit = parseExplicitRoute(prompt);
    if (explicit) return { ...explicit, latency_ms: Date.now() - start };

    const trimmed = prompt.trim();
    const { domain: regexDomain, matched } = detectDomain(trimmed);
    const complexityScore = scoreComplexity(trimmed);
    const tier = selectTier(regexDomain, complexityScore);
    const anaphora = hasAnaphora(trimmed);
    const confidence = computeConfidence(matched, trimmed.length, anaphora);

    const regexDecision: RouteDecision = {
        tier,
        domain: regexDomain,
        complexityScore,
        recommendedModel: getModel(tier),
        reason: `domain=${regexDomain} score=${complexityScore} tier=${tier} matched=${matched} anaphora=${anaphora}`,
        source: 'regex',
        confidence,
        regex_said: regexDomain,
        latency_ms: Date.now() - start,
    };

    // Only escalate to LLM on low confidence
    const config = loadConfig();
    if (confidence === 'low' && config.routing.useLlmClassifier) {
        const result = await classifyWithLlm(trimmed, recentMessages);

        if (result) {
            const llmTier = selectTier(result.domain, complexityScore);
            return {
                tier: llmTier,
                domain: result.domain,
                complexityScore,
                recommendedModel: getModel(llmTier),
                reason: result.reason,
                source: 'llm',
                confidence: result.confidence,
                regex_said: regexDomain,
                llm_said: result.domain,
                escalation_reason: anaphora ? 'anaphora detected' : 'low regex confidence',
                latency_ms: Date.now() - start,
                classifier_tokens: result.tokens,
            };
        }

        // LLM failed — fall back to regex result
        return {
            ...regexDecision,
            source: 'regex-fallback',
            escalation_reason: 'llm classifier failed',
            latency_ms: Date.now() - start,
        };
    }

    return regexDecision;
}



