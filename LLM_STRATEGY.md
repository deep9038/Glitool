# Glitool — LLM Strategy

## Decision: Switch from OpenAI to Together.ai

**Date approved:** 2026-05-21
**Reason:** OpenAI costs unsustainable at scale. Together.ai offers open source models
at 3–10× lower cost with comparable or better coding performance.
**Migration:** Server-side only. Zero CLI changes needed.

---

## Provider

| | OpenAI (old) | Together.ai (new) |
|--|-------------|-------------------|
| Models | GPT-4o-mini, GPT-4o | Llama, Qwen, DeepSeek |
| Open source | ❌ | ✅ |
| Self-host option | ❌ | ✅ |
| Vendor lock-in | High | Low |
| Privacy | Data to OpenAI | Data to Together.ai (opt-out available) |
| BYOK fallback | ✅ | ✅ (OPENAI_API_KEY still works) |

---

## Model Roster

| Model | Role | Why |
|-------|------|-----|
| `meta-llama/Llama-3.2-3B-Instruct-Turbo` | Classifier | Ultra cheap, fast, good enough for routing only |
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | General agent | Best speed/quality balance, reliable tool calling |
| `Qwen/Qwen2.5-Coder-72B-Instruct` | Coding agent | Purpose-built for code, beats GPT-4o-mini on HumanEval |
| `deepseek-ai/DeepSeek-V3` | Planning + Review | Best reasoning, deep architectural thinking |

---

## Model Assignment by Feature & Tier

### Classifier — ALL tiers, every message
```
Model: Llama 3.2 3B Turbo
Cost:  $0.06 / 1M tokens (~$0.00003 per message)
Why:   Just routing (chat/coding/debug/git). No intelligence needed.
       A 3B model is more than capable of domain classification.
```

---

### Anonymous tier (5 lifetime free requests)

| Feature | Model |
|---------|-------|
| All features | Llama 3.3 70B |

```
Cost to serve: ~$0.013 per request
Logic: These users have not paid anything.
       Use the cheapest decent model.
       If they like the quality, they will upgrade.
```

---

### Free tier (50 requests / month)

| Feature | Model | Why |
|---------|-------|-----|
| `/quick` | Llama 3.3 70B | Conversational, speed matters more than depth |
| `/explain` | Llama 3.3 70B | Simple explanation, no coding needed |
| `/git` | Llama 3.3 70B | Bash commands only, no heavy reasoning |
| `/plan` | Llama 3.3 70B | Good enough for basic planning |
| `/review` | Llama 3.3 70B | Basic code analysis |
| `/coder` | Qwen 2.5 Coder 72B | Give free users a taste of real quality |
| `/debug` | Qwen 2.5 Coder 72B | Code-specialist finds bugs better |
| `/refactor` | Qwen 2.5 Coder 72B | Code-specialist restructures better |

```
Cost to serve: ~$0.055 / user / month
Logic: Coding features get the specialist model so free users
       experience real quality and want to upgrade.
       Simple features use the cheaper model to keep costs low.
```

---

### Pro tier ($12 / month — unlimited)

| Feature | Model | Why |
|---------|-------|-----|
| `/quick` | Llama 3.3 70B | Fast responses better than slow ones here |
| `/explain` | Llama 3.3 70B | Speed matters for simple explanations |
| `/git` | Llama 3.3 70B | Bash-only, no need for heavy model |
| `/plan` | DeepSeek V3 | Best architectural reasoning available |
| `/review` | DeepSeek V3 | Deep code analysis, security, patterns |
| `/coder` | Qwen 2.5 Coder 72B | Best coding model open source |
| `/debug` | Qwen 2.5 Coder 72B | Code specialist traces bugs accurately |
| `/refactor` | Qwen 2.5 Coder 72B | Code specialist restructures safely |

```
Cost to serve: ~$0.18 / user / month
Margin:        $12.00 - $0.18 = $11.82 per Pro user
Logic:         Pro users pay for noticeably better results.
               DeepSeek V3 + Qwen Coder is a clear quality jump.
```

---

## Benchmarks vs Current Setup

| Model | Coding (HumanEval) | Speed | Cost/1M |
|-------|--------------------|-------|---------|
| GPT-4o-mini (current) | 87% | 110 tok/s | $0.37 avg |
| Llama 3.3 70B | 88% | 130 tok/s | $0.88 |
| **Qwen 2.5 Coder 72B** | **94%** | 90 tok/s | $1.20 |
| DeepSeek V3 | 91% | 60 tok/s | $1.25 |
| Llama 3.2 3B | 52% | 200 tok/s | $0.06 |

**Qwen 2.5 Coder 72B beats GPT-4o-mini by 7% on coding tasks.**

---

## Economics

### What is 1 million tokens in real use?

```
1 token  ≈  ¾ of a word

Simple chat request    →  ~1,500 tokens
Coding task (/coder)   →  ~8,000 tokens
Full pipeline run      →  ~25,000 tokens

1M tokens = ~666 simple chats
           = ~125 coding tasks
           = ~40 full pipeline runs
```

### Monthly cost model

```
Scenario: 100 free users + 10 Pro users

Free users:  100 × $0.055  =   $5.50
Pro users:    10 × $0.18   =   $1.80
Classifier:  (trivial)     =   ~$0.20
                              ────────
Total LLM cost             =   $7.50 / month

Pro revenue:  10 × $12     =  $120.00 / month
                              ────────
Net margin                 =  $112.50 / month
```

---

## Implementation Plan

### Server changes (proxy.ts)

```ts
// Old
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const API_KEY = process.env.OPENAI_API_KEY;

// New
const TOGETHER_URL = 'https://api.together.xyz/v1/chat/completions';
const API_KEY = process.env.TOGETHER_API_KEY;
```

### Model mapping (server-side)

```ts
const MODEL_MAP: Record<string, Record<string, string>> = {
    free: {
        default:    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        coding:     'Qwen/Qwen2.5-Coder-72B-Instruct',
        classifier: 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
    },
    pro: {
        default:    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        coding:     'Qwen/Qwen2.5-Coder-72B-Instruct',
        planning:   'deepseek-ai/DeepSeek-V3',
        review:     'deepseek-ai/DeepSeek-V3',
        classifier: 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
    },
};
```

### CLI changes
**None.** The factory.ts already points to the Glitool backend.
Model selection is handled entirely server-side.

### BYOK users
If `OPENAI_API_KEY` exists in `~/.glitool/.env`:
- Bypass Together.ai entirely
- Call OpenAI directly with their own key
- No model mapping applied

---

## Future: Self-hosting option (Phase 4)

When revenue supports it, run these models on a rented GPU (RunPod):

```
GPU:    A100 80GB  →  runs Llama 70B + Qwen 72B together
Cost:   ~$1.50/hour rented on demand
Saves:  100% of Together.ai fees above break-even
```

This is the corporate self-hosted path mentioned in ROADMAP.md.

---

## Open Decisions

| Question | Decision | Status |
|----------|----------|--------|
| Provider | Together.ai | ✅ Approved |
| Main coding model | Qwen 2.5 Coder 72B | ✅ Approved |
| Classifier model | Llama 3.2 3B Turbo | ✅ Approved |
| Planning model (Pro) | DeepSeek V3 | ✅ Approved |
| Self-hosting | Phase 4, post-revenue | ⏳ Later |
| Google OAuth | After launch | ⏳ Later |
| DeepSeek R1 for Pro | Evaluate post-launch | ❓ Undecided |
