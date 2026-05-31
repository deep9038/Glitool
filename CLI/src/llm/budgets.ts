/**
 * Tier-aware client-side budgets.
 *
 * HISTORY_BUDGET — max chars of conversation history to resend on each LLM call.
 *   trimHistory() drops oldest messages to fit under this.
 *
 * COMPACT_AT — when total conversation chars cross this threshold, compactOldMessages()
 *   summarizes the older portion into a single SystemMessage. Set 25% below
 *   HISTORY_BUDGET so trimming never has to happen mid-turn.
 *
 * These are CLIENT budgets (how much history we send). They do NOT affect the
 * user's TOKEN cap (which is server-tracked: TOKEN_LIMITS in checkUsageLimit.ts).
 */
export type Plan = 'anon' | 'free' | 'pro';

export const HISTORY_BUDGET: Record<Plan, number> = {
    anon:  40_000,   // ~10k tokens — Qwen3-Coder 256K window, tiny slice
    free:  80_000,   // ~20k tokens — Qwen3-Coder 256K window, moderate
    pro:  200_000,   // ~50k tokens — DeepSeek V4 Pro 512K window, generous
};

export const COMPACT_AT: Record<Plan, number> = {
    anon:  30_000,
    free:  60_000,
    pro: 150_000,
};
