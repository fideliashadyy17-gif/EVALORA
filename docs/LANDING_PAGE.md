# EVALORA — public landing page

The public marketing page (`src/app/page.tsx`) is the only surface this
document covers. The authenticated application is unchanged: no dashboard,
examination, proctoring, billing or permission code was modified.

## What was verified before anything was advertised

Discovery used three independent sources, and a claim only reached the page if
at least one of them proved it:

| Source | What it proved |
| --- | --- |
| Repository (`src/app`, `src/lib`, `supabase/`) | which routes, actions and libraries exist and are wired |
| Production Supabase (`nqxqisjtbfsratgztmch`, read-only) | the real schema (80 relations), live plan catalogue and actual usage counts |
| Production deployment (`evalora-edu.online`) | what the deployed product currently serves |
| `docs/MASTER_REQUIREMENTS_MATRIX.md`, `IMPLEMENTATION_PHASE_STATUS.md`, `PHASE_REPORT.md` | what the project's own evidence ledger marks incomplete |

### Feature inventory

`src/lib/landing.ts` holds the machine-readable inventory: every record has a
name, purpose, the roles that use it, a `status`, the evidence that backs it,
and an `onLanding` flag. The page renders only records with `onLanding: true`.

- `status: "live"` — reachable and working in the product.
- `status: "conditional"` — real but gated by plan entitlement, a per-examination
  setting, or a platform feature flag. The page states the gate.
- `status: "not-shipped"` — stub, schema-only or inert. **Never advertised.**

### Deliberately absent from the page

AI question generation · AI-assisted marking · proctoring session recording ·
Paper scanning / OCR marking · native Lockdown for macOS, Linux, iPadOS or
Chromebook · Google/Microsoft SSO · Classroom, Microsoft 365, Canvas and SIS
integrations · public API and webhooks · native mobile apps.

Each of these exists in the repository only as a stub, an inert provider
boundary, or a schema without a workflow. `docs/MASTER_REQUIREMENTS_MATRIX.md`
records them as NOT IMPLEMENTED; the page says so implicitly by not selling them.

### Claims that are stated with their limit

| Claim on the page | The limit disclosed |
| --- | --- |
| Video proctoring | live supervision only; session recording is **not** enabled |
| Secure Lockdown | Windows 10/11 Secure Exam Browser, per examination, off by default |
| Clipboard controls | cannot stop a second device, a screenshot or an extension |
| Proctoring integrity | observations are evidence for a human, never an automatic verdict |
| Pricing | paid plans start with a 14-day trial and activate after manual verification |

## Design system

The green identity is preserved (`#0a5c36` primary, `#062719` deep forest,
`#c9a227` heritage gold, cream paper) and extended with a landing-only layer.

- **Scoping.** Every new rule in `src/app/globals.css` is nested under
  `.evalora-landing` (or namespaced `lp-*`), so the dashboard, admin console and
  candidate surfaces keep their previous styles.
- **Type.** Fraunces (display) + Public Sans (text), both self-hosted through
  `@fontsource-variable`, so there is no third-party font request.
- **Product previews.** Nine interface previews are drawn as real DOM from the
  shipped screens (`src/components/site/landing/ProductPreviews.tsx`) instead
  of screenshots: they stay sharp at any density, cost a few kilobytes, are
  readable by screen readers, and cannot silently go stale.
- **Mathematics.** KaTeX is rendered on the server for the previews, so the
  page ships no extra JavaScript for the maths.

## Accessibility

- One `<h1>`, a strictly descending heading order, and labelled `<section>`s.
- Skip link, `<header>`/`<main>`/`<footer>` landmarks, `aria-label` on every nav.
- Tab interfaces use `role="tablist"` / `role="tab"` / `role="tabpanel"` with
  `aria-selected`, roving `tabIndex` and arrow-key navigation.
- Focus-visible rings on every control; `prefers-reduced-motion` removes all
  reveal and marquee animation (verified: zero hidden blocks under reduce).
- axe-core reports **0 violations** on `/`, `/features`, `/how-it-works`,
  `/use-cases`, `/pricing`, `/faq`, `/join`, `/login`, `/register`, `/contact`,
  `/help`, `/privacy`, `/terms`, `/cookies`.

## Performance

- The whole landing page is **11.9 kB** of route JavaScript (136 kB first load),
  against 520 kB for the live-quiz client and 774 kB for the exam client.
- Server-rendered HTML: no client fetch for the hero, previews or pricing.
- Pricing is read with the service role under a 60-second in-process cache and a
  2-second cap; a slow or unavailable database never blocks the page, and a
  verified fallback catalogue renders instead.
- A first-time visitor with no auth cookie triggers **zero** session lookups.

## Verification

```bash
npm run build
npx next start -p 3100 -H 127.0.0.1 &
node scripts/verify-landing.mjs      # real Chromium, 5 viewports
```

`.github/workflows/landing-visual.yml` runs that script on every pull request
that touches the landing page and uploads the screenshots as an artifact.

Server-side checks that do not need a browser:

```bash
node scripts/verify-landing-html.mjs   # rendered HTML: links, axe, structure
```
