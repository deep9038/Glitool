# Glitool — LLM Strategy

## Decision: Switch from OpenAI to Together.ai

**Date approved:** 2026-05-21
**Date shipped:** 2026-05-24 (v2.0.0)
**Reason:** OpenAI costs unsustainable at scale. Together.ai offers open source models
at 3–10× lower cost with comparable or better coding performance.
**Migration:** Server-side only. Zero CLI changes needed.

> ⚠️ **Update 2026-05-24:** The originally planned roster (Llama-3.2-3B, Qwen2.5-Coder-72B, DeepSeek-V3) moved from Together.ai serverless to dedicated-endpoint-only between strategy design and ship date. We pivoted to a different set of currently-serverless models during deploy. The **"Shipped Roster"** section below is what's actually in production.

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

### Shipped roster (verified serverless on Together.ai as of 2026-05-24)

| Model | Role | Why |
|-------|------|-----|
| `Qwen/Qwen2.5-7B-Instruct-Turbo` | Classifier | Small, fast, cheap — sufficient for domain routing |
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | General agent | Best speed/quality balance, reliable tool calling |
| `openai/gpt-oss-20b` | Coding agent | OpenAI's open-source 20B model — fast iteration |
| `openai/gpt-oss-120b` | Planning + Review (Pro) | OpenAI's open-source 120B — deep reasoning |

### Originally planned (DEPRECATED — became non-serverless on Together)

| Model | Original role | Status |
|-------|---------------|--------|
| `meta-llama/Llama-3.2-3B-Instruct-Turbo` | Classifier | Non-serverless. Requires dedicated endpoint (~$360/mo). |
| `Qwen/Qwen2.5-Coder-72B-Instruct` | Coding agent | Non-serverless. |
| `deepseek-ai/DeepSeek-V3` | Planning + Review | Non-serverless / "service unavailable". |

---

## Model Assignment by Feature & Tier

### Classifier — ALL tiers, every message
```
Model: Qwen 2.5 7B Instruct Turbo
Cost:  ~$0.20 / 1M tokens
Why:   Just routing (chat/coding/debug/git). 7B is more than enough.
       Bypasses quota counting via X-Glitool-Internal header.
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
| `/coder` | gpt-oss 20b | Fast OpenAI open-source model |
| `/debug` | gpt-oss 20b | Same — small + fast for iteration |
| `/refactor` | gpt-oss 20b | Same |

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
| `/plan` | gpt-oss 120b | Largest serverless model — deep reasoning |
| `/review` | gpt-oss 120b | Deep code analysis, security, patterns |
| `/coder` | gpt-oss 20b | OpenAI open-source, fast iteration |
| `/debug` | gpt-oss 20b | Same |
| `/refactor` | gpt-oss 20b | Same |

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

### Model assignment (server-side — `server/src/routes/proxy.ts:9-12`)

```ts
const CLASSIFIER_MODEL = 'Qwen/Qwen2.5-7B-Instruct-Turbo';
const DEFAULT_MODEL    = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const CODING_MODEL     = 'openai/gpt-oss-20b';
const PLANNING_MODEL   = 'openai/gpt-oss-120b';
```

`resolveModel(req)` picks one of these based on `req.user.plan` and what the client requested. See proxy.ts for the full routing table.

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
| Provider | Together.ai | ✅ Shipped |
| Main coding model | gpt-oss 20b (Qwen 2.5 Coder went non-serverless) | ✅ Shipped |
| Classifier model | Qwen 2.5 7B Turbo (Llama 3.2 3B went non-serverless) | ✅ Shipped |
| Planning model (Pro) | gpt-oss 120b (DeepSeek V3 went non-serverless) | ✅ Shipped |
| Self-hosting | Phase 4, post-revenue | ⏳ Later |
| Google OAuth | After launch | ⏳ Later |
| Migrate to OpenRouter for tier variety | Evaluate post-launch | ❓ Undecided |
