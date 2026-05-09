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
}



function getModel(tier: TaskTier):string{
    const userPref = loadConfig().preferredModel;
    if (userPref && userPref !== 'gpt-4o-mini') return userPref;
    return MODEL_BY_TIER[tier];
}



const MODEL_BY_TIER: Record<TaskTier,string> = {
    quick:  'gpt-4o-mini',
    standard:'gpt-5.4-mini',
    complex:  'gpt-5.4'
}


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





function detectDomain(prompt: string): TaskDomain{
    if (CHAT_PATTERNS.some(p=> p.test(prompt))) return 'chat';
    if (EXPLANATION_PATTERNS.some(p => p.test(prompt))) return 'explanation';
    if (CODING_PATTERNS.some(p => p.test(prompt))) return 'coding';
    if( PLANNING_PATTERNS.some(p => p.test(prompt))) return 'planning';
    return 'chat';
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


export function route(prompt: string):RouteDecision{
    const trimmed = prompt.trim();
    const domain = detectDomain(trimmed);
    const complexityScore = scoreComplexity(trimmed);
    const tier = selectTier(domain,complexityScore);


    return {
        tier,
        domain,
        complexityScore,
        recommendedModel: getModel(tier),
        reason:`domain=${domain} score=${complexityScore} tier=${tier}`
    }
}



export function detectComplexity(message: string): TaskComplexity{
    const { domain, tier } = route(message);
    return (domain === 'coding' || tier === 'complex') ? 'complex': 'simple';
}