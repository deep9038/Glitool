# Glitool — Payment Integration Plan

## Decision

**Provider: Lemon Squeezy**
**Date approved:** 2026-05-21

### Why Lemon Squeezy

| Reason | Detail |
|--------|--------|
| Solo dev friendly | No business registration needed |
| Merchant of record | They handle GST, VAT, all global taxes |
| India support | Payouts to Indian bank via wire transfer |
| INR pricing | Can show ₹999/month instead of $12 |
| Simple API | Stripe-like, easy to integrate |
| Hosted checkout | No PCI compliance needed on our end |

---

## Pricing

| Tier | Price | Requests | Model quality |
|------|-------|----------|---------------|
| Anonymous | $0 | 5 lifetime | Llama 3.3 70B |
| Free | $0 | 50 / month | Qwen 2.5 Coder (coding) |
| Pro | $12 / month | Unlimited | DeepSeek V3 + Qwen Coder |

**India pricing option:** ₹999/month (show INR to Indian users)

---

## Payment Flow

```
User hits 50 req/month limit
         │
         ▼
CLI shows upgrade message:
"✗ Monthly limit reached (50/50)"
"Upgrade to Pro → https://glitool.dev/upgrade"
         │
         ▼
User opens browser → /upgrade page
         │
         ▼
Clicks "Upgrade to Pro — $12/month"
         │
         ▼
POST /billing/checkout (with user's glt_ token)
→ Server creates Lemon Squeezy checkout URL
→ Pre-fills user email
→ Returns checkout URL
         │
         ▼
Browser redirects to Lemon Squeezy hosted checkout
(user enters card — we never touch card data)
         │
User pays
         │
         ▼
Lemon Squeezy fires webhook → POST /webhooks/ls
→ Event: subscription_created
→ Server finds user by email
→ Sets user.plan = 'pro' in MongoDB
→ Saves subscription details
         │
         ▼
Lemon Squeezy redirects user → /upgrade?success=true
         │
         ▼
Next CLI request:
→ Backend sees plan = 'pro'
→ No limit check
→ Unlimited requests
→ StatusBar shows "pro · gpt-4o-mini"
```

---

## Architecture

### What gets built

```
Glitool/
├── server/
│   └── src/
│       ├── routes/
│       │   └── billing.ts          ← NEW: checkout endpoint
│       └── webhooks/
│           └── lemonsqueezy.ts     ← NEW: payment event handler
│
└── client/
    └── app/
        └── upgrade/
            └── page.tsx            ← NEW: upgrade page
```

### CLI changes
**None.** The upgrade URL is already shown when the limit is hit.
After plan upgrade, the backend returns `plan: 'pro'` on next poll.

---

## Server Routes

### POST /billing/checkout
Called by the upgrade page when user clicks "Upgrade".

**Request:**
```json
{ "email": "user@github.com" }
```

**What it does:**
1. Validate user token (must be authenticated)
2. Call Lemon Squeezy API to create a checkout session
3. Pre-fill user email so they don't type it again
4. Embed user email in checkout metadata (for webhook lookup)
5. Return checkout URL

**Response:**
```json
{ "checkout_url": "https://checkout.lemonsqueezy.com/buy/xxx" }
```

---

### POST /webhooks/ls
Lemon Squeezy fires this on every subscription event.
Must verify the webhook signature before processing.

**Events to handle:**

| Event | Action |
|-------|--------|
| `subscription_created` | Set `user.plan = 'pro'`, save subscription |
| `subscription_updated` | Update subscription status |
| `subscription_cancelled` | Mark as cancelling (stays pro until period end) |
| `subscription_expired` | Set `user.plan = 'free'` immediately |
| `subscription_payment_failed` | Log it (email later) |
| `subscription_payment_success` | Update `current_period_end` |

---

## Environment Variables

Add to `server/.env`:

```
LEMONSQUEEZY_API_KEY=your_api_key_here
LEMONSQUEEZY_STORE_ID=your_store_id_here
LEMONSQUEEZY_VARIANT_ID=your_variant_id_here
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret_here
```

---

## Website — /upgrade page

### Layout
```
┌─────────────────────────────────────────────────┐
│  glitool                                        │
│                                                 │
│  Upgrade to Pro                                 │
│                                                 │
│  ┌───────────────┐    ┌───────────────────────┐ │
│  │  Free         │    │  Pro           $12/mo │ │
│  │               │    │                       │ │
│  │  50 req/month │    │  Unlimited requests   │ │
│  │  Basic models │    │  Best models          │ │
│  │               │    │  DeepSeek V3          │ │
│  │  Current plan │    │  Qwen 2.5 Coder       │ │
│  └───────────────┘    │                       │ │
│                       │  [Upgrade Now]        │ │
│                       └───────────────────────┘ │
│                                                 │
│  Questions? deep22sarkar@gmail.com              │
└─────────────────────────────────────────────────┘
```

### States
- Default → show Free vs Pro comparison + Upgrade button
- Loading → button shows "Redirecting..."
- `?success=true` → "You're now Pro. Go back to your terminal."
- `?cancelled=true` → "No worries. You're still on Free."

---

## Subscription Model (already in MongoDB)

```ts
// Already exists in server/src/models/index.ts
interface ISubscription {
    user_id:            ObjectId;
    stripe_customer_id: string;   // rename to ls_customer_id
    stripe_sub_id:      string;   // rename to ls_subscription_id
    status:             'active' | 'cancelled' | 'past_due';
    current_period_end: Date;
}
```

Minor rename needed: `stripe_*` fields → `ls_*` fields.

---

## Webhook Security

Every webhook from Lemon Squeezy includes a signature header.
Must verify before processing — otherwise anyone can fake a payment.

```ts
import crypto from 'crypto';

function verifyWebhook(rawBody: Buffer, signature: string): boolean {
    const hmac = crypto
        .createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET!)
        .update(rawBody)
        .digest('hex');
    return hmac === signature;
}
```

If verification fails → return 400, log the attempt, do nothing.

---

## CLI — Upgrade Message (already built)

When free limit is hit, App.tsx already shows:

```
✗ Monthly limit reached (50/50 requests used)

Upgrade to Pro for unlimited access:
→ https://glitool.dev/upgrade

Or wait until June 1 for your limit to reset.
```

No CLI changes needed for payment integration.

---

## After Successful Payment

1. Lemon Squeezy webhook fires → `user.plan = 'pro'`
2. User restarts glitool (or token refreshes)
3. Backend returns `plan: 'pro'` in next request
4. StatusBar shows `pro · model`
5. No more limit checks — unlimited requests
6. Pro models (DeepSeek V3, Qwen Coder) assigned server-side

---

## Cancellation Flow

```
User cancels subscription on Lemon Squeezy dashboard
         │
         ▼
Webhook: subscription_cancelled
→ Set subscription.status = 'cancelled'
→ Keep user.plan = 'pro' until current_period_end
         │
         ▼
On current_period_end date:
Webhook: subscription_expired
→ Set user.plan = 'free'
→ User now has 50 req/month limit again
```

User keeps Pro access until the end of the period they paid for.

---

## Economics

```
Revenue per Pro user:     $12.00 / month
LLM cost per Pro user:    $0.18  / month
Lemon Squeezy fee:        ~$1.50 / month (fees + transaction %)
                          ──────────────
Net per Pro user:         $10.32 / month

Break-even (cover LLM + infra):  2 Pro users
Profitable at:                   Any number above 2
```

---

## Build Order

Must be done IN THIS ORDER:

```
1. PA.8  — Deploy backend + website (payment needs real URLs)
2. PA.9  — E2E test auth flow on production
3. PAY.1 — Lemon Squeezy account + product setup (30 min, no code)
4. PAY.2 — Server billing route + webhook handler (2 hours)
5. PAY.3 — Website /upgrade page (1 hour)
6. PAY.4 — End-to-end payment test with Lemon Squeezy test mode (1 hour)
7. PA.10 — Publish CLI v2.0.0
```

**Total payment work: ~5 hours after deploy is done.**

---

## Open Decisions

| Question | Decision | Status |
|----------|----------|--------|
| Payment provider | Lemon Squeezy | ✅ Approved |
| Price | $12/month | ✅ Approved |
| INR pricing | ₹999/month option | ⏳ Decide at launch |
| Annual discount | 2 months free ($120/yr) | ❓ Undecided |
| Team plans | After launch | ⏳ Later |
| Stripe support | BYOK fallback only | ✅ Decided |
| Refund policy | 7 days no questions | ❓ Undecided |
| Free trial for Pro | 7 days free | ❓ Undecided |
