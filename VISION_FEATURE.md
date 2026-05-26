# Vision Feature Plan — Visual-Guided Code Modification

> Status: Planned, not started. Build after clarification feature is tested.

## What the user experiences

```
User: takes screenshot → Ctrl+V in glitool terminal
      Screenshot detected badge appears (like the paste badge)
      User types: "add a post button beside the call button"
      Hits Enter

Glitool:
  Analyzing screenshot...       ← Qwen2.5-VL 72B reads the image
  searchCode "CallButton"       ← found in codebase
  readFile components/Card.tsx
  editFile → PostButton added   ← matches existing style
  Done
```

## Vision Model

**Qwen2.5-VL 72B** — `Qwen/Qwen2.5-VL-72B-Instruct` on Together.ai

| Why | Detail |
|-----|--------|
| Best UI/diagram understanding on Together.ai | MMBench score: 88.6 |
| Purpose-built for visual agent tasks | Structured output support |
| Serverless on Together.ai | No dedicated instance needed |
| Cheap | ~$0.002 per screenshot |
| OpenAI-compatible API | Accepts base64 image_url — plugs into existing makeLlm() |

**Why NOT Llama 4 Scout** — Scout is built for text at scale (10M context), not visual understanding. Documented vision accuracy issues — sometimes misreads image content.

**Fallback** — Llama 4 Maverick if Qwen2.5-VL goes non-serverless.

---

## Architecture: Two-Step Pipeline

```
Image + text prompt
        ↓
   STEP 1: visualAgent.ts
   Qwen2.5-VL 72B
   → "I see a CallCard component, blue rounded Call button
      top-right. Search hints: CallButton, handleCall, btn-call.
      Button style: bg-blue-500, rounded-lg, px-4 py-2"
        ↓
   Enhanced prompt built:
   "[Original]: add a post button beside call button
    [Visual context]: CallCard component, Call button is
    blue rounded top-right, style: bg-blue-500 rounded-lg"
        ↓
   STEP 2: existing code agent (debugger/coder)
   searchCode → readFile → editFile
   Uses visual context to find exact location + match style
```

No new routing domain needed — visual analysis enriches the prompt, existing agents do the code work.

---

## New Files to Create (2)

### `CLI/src/imageCapture.ts`

```
- detectClipboardImage()
    → runs: xclip -selection clipboard -t TARGETS -o
    → checks if output contains "image/png" or "image/jpeg"
    → returns: boolean

- captureClipboardImage()
    → runs: xclip -selection clipboard -t image/png -o > /tmp/glitool_img_[timestamp].png
    → reads file, converts to base64
    → resizes if > 1120px wide (stays within Qwen tile limit)
    → returns: { base64: string, mimeType: string, path: string }

- cleanupTempImage(path)
    → deletes the temp file after send
```

### `CLI/src/agents/visualAgent.ts`

```
- runVisualAgent(base64Image, mimeType, userRequest, domain)
    → builds vision message:
       content: [
         { type: "image_url", image_url: { url: "data:image/png;base64,..." } },
         { type: "text", text: system prompt + user request }
       ]
    → calls makeLlm('vision') — model name triggers server to route to Qwen2.5-VL
    → system prompt: "Analyze this UI screenshot. Identify:
       1. What UI elements are visible
       2. The specific element the user is referring to
       3. Its location, style (colors, size, shape)
       4. Code search hints (component names, class names, handler names)
       Return as structured JSON."
    → parses JSON response
    → returns: { elements, targetElement, location, style, searchHints }

- buildVisualContext(analysis)
    → formats the analysis into a text block
    → appended to the original prompt as [Visual context]
```

---

## Files to Modify (4)

### `CLI/src/ui/App.tsx` — 4 changes

**Change 1** — Add state for attached image after clarification state vars:
```tsx
const [attachedImage, setAttachedImage] = useState<{
    base64: string;
    mimeType: string;
    path: string;
} | null>(null);
```

**Change 2** — In Ctrl+V handler, add image detection BEFORE existing text paste code:
```tsx
const hasImage = execSync(
    'xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -c "image/png" || true',
    { encoding: 'utf8', timeout: 2000 }
).trim() !== '0';

if (hasImage) {
    const { captureClipboardImage } = await import('../imageCapture.js');
    const img = await captureClipboardImage();
    setAttachedImage(img);
    return;
}
// existing text paste code continues...
```

**Change 3** — Add screenshot badge in JSX above the input box:
```tsx
{attachedImage && (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={0}>
        <Text color="cyan" bold>📸 SCREENSHOT  </Text>
        <Text color={colors.muted}>attached · will send with message</Text>
        <Text color={colors.muted}>  ·  </Text>
        <Text color={colors.amber} bold>Esc</Text>
        <Text color={colors.muted}> to remove</Text>
    </Box>
)}
```
Also add Esc to clear: `if (key.escape && attachedImage) { setAttachedImage(null); return; }`

**Change 4** — Pass `attachedImage` to `chat()` as 9th argument and clear after submit:
```tsx
attachedImage ?? undefined,
// after chat() resolves:
setAttachedImage(null);
```

---

### `CLI/src/agent.ts` — 2 changes

**Change 1** — Add param to `chat()` signature:
```typescript
attachedImage?: { base64: string; mimeType: string } | undefined,
```

**Change 2** — After the clarifier block, before domain if-blocks:
```typescript
if (attachedImage) {
    emit('vision_analysis', { status: 'analyzing' });
    onStatus?.('Analyzing screenshot...');
    const { runVisualAgent, buildVisualContext } = await import('./agents/visualAgent.js');
    const analysis = await runVisualAgent(
        attachedImage.base64,
        attachedImage.mimeType,
        finalInput,
        decision.domain
    );
    finalInput = `${finalInput}\n\n${buildVisualContext(analysis)}`;
    emit('vision_analysis', { status: 'done', elements: analysis.elements, target: analysis.targetElement });
}
```

---

### `server/src/routes/proxy.ts` — 2 changes

**Change 1** — Add vision model constant:
```typescript
const VISION_MODEL = 'Qwen/Qwen2.5-VL-72B-Instruct';
```

**Change 2** — In `resolveModel()`, add at the very top before plan checks:
```typescript
const messages = req.body?.messages ?? [];
const hasImage = messages.some((m: any) =>
    Array.isArray(m.content) &&
    m.content.some((c: any) => c.type === 'image_url')
);
if (hasImage) {
    if (plan === 'anon') throw new Error('vision_not_available');
    return VISION_MODEL;
}
```

---

### `monitor/public/index.html` — direct edit

Add to META:
```javascript
vision_analysis: { label: 'Vision', cls: 'teal' }
```
Add to preview():
```javascript
if (e.type === 'vision_analysis') return e.status === 'done'
    ? `target: ${e.target ?? 'unknown'}`
    : 'analyzing...';
```

---

## Server-Side: Why No Proxy Content Changes Needed

The proxy already forwards the full `body` to Together.ai unchanged (except model swap). Image content inside `messages` passes through automatically. The only server change is model routing — Qwen2.5-VL gets selected when image content is detected.

---

## Tier Access

| Tier | Vision | Reason |
|------|--------|--------|
| Anon | No | Too expensive per request |
| Free | Yes | Qwen2.5-VL is cheap enough (~$0.002/image) |
| Pro | Yes | Full access |

When anon user pastes screenshot → show: "Sign in to use vision features → /signup"

---

## Resize Rule

Together.ai Qwen2.5-VL processes max 1120×1120 per tile.
- If image width > 1120px → resize to 1120px wide, preserve ratio
- Use `sharp` npm package (lightweight)
- If `sharp` not installed, send as-is with console warning

---

## Build Order

```
1. imageCapture.ts          ← standalone, no deps
2. visualAgent.ts           ← depends on imageCapture types
3. proxy.ts server change   ← VISION_MODEL + resolveModel update
4. agent.ts changes         ← import visualAgent, new param
5. App.tsx changes          ← UI badge + pass attachedImage to chat()
6. monitor update           ← vision_analysis event
```

---

## Open Questions (answer before building)

- [ ] Add `sharp` package for image resizing? (5MB, but handles large screenshots cleanly)
- [ ] Exact Together.ai model ID — verify `Qwen/Qwen2.5-VL-72B-Instruct` is the serverless ID
- [ ] Vision for anon: block with message, or silently fall back to text-only?
