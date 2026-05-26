# Landing Page Plan — glit.in

> Status: Planned, not started. Build after core feature work is complete.

## Goal

Drive npm installs. Primary CTA: `npm install -g glitool`

## Tech

- Next.js 16 (already in `client/`)
- Straight to code — no Figma step
- Static generation for SEO performance

## Vibe

Clean modern SaaS (Vercel/Linear aesthetic) with the CLI tool's dark color palette.

## Color Palette

| Element       | Color     |
|---------------|-----------|
| Background    | `#0d1117` |
| Cards/surface | `#161b22` |
| Border        | `#30363d` |
| Text          | `#e6edf3` |
| Muted text    | `#8b949e` |
| Blue accent   | `#58a6ff` |
| Green CTA     | `#3fb950` |
| Purple/blue gradient (hero) | `#bc8cff → #58a6ff` |

## Page Structure

### 1. Nav
- Logo (glit.in wordmark)
- Links: Features · Pricing · GitHub
- Right: `npm install -g glitool` pill (copies on click)

### 2. Hero
- Headline: *"Your AI coding assistant, in the terminal"*
- Sub-copy: 1–2 sentences explaining what it does
- CTAs: `npm install -g glitool` (primary, copy-to-clipboard) · `Sign in free →` (secondary)
- Animated terminal window — typewriter showing a real glitool session

### 3. Features (3-column cards)
- Smart routing — right model for the right task
- 8 specialized agents — planning, debugging, refactoring, git, code review
- Works with your key (BYOK) or use Glitool's free tier

### 4. How It Works
- 3-step visual: **Install** → **Run `glitool`** → **Chat like a senior dev is pair-programming**

### 5. Footer
- npm · GitHub · glit.in copyright

## SEO Plan
- `<title>`, `<meta description>`, Open Graph tags
- Next.js `metadata` export (App Router)
- Semantic HTML: `<main>`, `<section>`, `<h1>`/`<h2>` hierarchy
- Static generation — no JS blocking on marketing page

## Open Questions (answer before building)
- [ ] Final headline/tagline copy — need 3 options to pick from
- [ ] GitHub repo public? Link it?
- [ ] Mention pricing tiers anywhere on this page?
- [ ] Terminal animation: real agent conversation or abstract demo?
