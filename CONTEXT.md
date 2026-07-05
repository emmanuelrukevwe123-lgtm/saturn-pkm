# Project Context — Saturn PKM

> Living log of what Claude is building and why. Updated as work happens.

## What this project is
A **Personal Knowledge Management system** (Zettelkasten-style linked notes) built with
**plain HTML/CSS/JS** — no frameworks, no build step. Notes are Markdown, link to each
other via `[[Note title]]`, and show backlinks plus a force-directed **Graph** view.
Data lives in `localStorage` (local-first; Google sign-in scopes it per account).
**LIVE at https://saturn-pkm.vercel.app** — landing page at `/`, app at `/app`, plus one
Vercel serverless function (`api/ai.js`) powering free Gemini AI features (note
summaries + "Ask Saturn" Q&A over the user's notes).

- Plan: `pkm-plan.md` (7 phases)
- Design reference: `Saturn.html` (design-tool export — reference only, never edited).
  It's a bundler export: the real page is JSON-encoded on line 180 (`__bundler/template`).
- Design language (since 2026-07-02 redesign): **exact clone of the Saturn export as rendered** —
  monochrome LIGHT/DARK palettes (light: `#EAEAEA` bg / `#141414` accent; dark inverted),
  Baloo 2 headings (52px page titles, weight 400), Quicksand body, 252px sidebar,
  980px content column, ring cards, pill filters, ledger rows.
  (The earlier cream/terracotta look came from the template's *fallback* values, which the
  rendered design overrides with theme vars.)

## Files
| File | Purpose |
|---|---|
| `public/index.html` | **Landing page** (marketing/how-to; self-contained CSS, dark-mode aware) |
| `public/app.html` | **The app**: sidebar + screens (Notes, note detail, Tags, Graph, Progress, Bin, Add) + Ask Saturn fab/popover |
| `public/script.js` | All app logic: state, localStorage, rendering, Markdown, links, tags, stats, graph simulation, auth, AI calls |
| `public/style.css` | Saturn design tokens as CSS variables (light + `.dark`), all styling, mobile `@media (max-width: 880px)` block |
| `public/firebase-config.js` | Firebase web config (project `saturn-1165b`) for Google sign-in |
| `public/favicon.svg` | Ringed-planet favicon (adapts to light/dark browser theme) |
| `api/ai.js` | Vercel serverless function: Firebase-token-gated streaming proxy to Gemini |
| `package.json` | Deps for the serverless function only (`jose`) — the app stays build-free |
| `vercel.json` | No build; serve `public/`; cleanUrls; `/__/auth/*` rewrites (sign-in proxy) |
| `docs/pkm-plan.md` | The original build plan |
| `docs/USAGE.md` | End-user guide to the app |
| `docs/AI.md` | AI features: how they work, setup (env vars), error meanings |
| `docs/GOOGLE_AUTH.md` | Google sign-in setup |
| `docs/DEPLOY.md` | Vercel free-plan deployment guide |
| `design/Saturn.html` | Design reference export — never edited |
| `README.md` | Project overview + structure + live URL |
| `CONTEXT.md` | This file |

## Key decisions
- **User asked Claude to build the app** (2026-07-02) rather than build it themselves as a learning exercise.
- Links are **not stored** — derived by scanning note bodies for `[[Title]]` (case-insensitive title match).
- Hand-rolled Markdown converter (headings, bold, italic, lists, inline code, line breaks); HTML-escaped first to avoid injection.
- Missing links (`[[No such note]]`) render as dashed "ghost" links — clicking creates that note.
- **Light + dark themes** (2026-07-02): `body.dark` overrides the CSS variables; persisted
  in localStorage key `saturn-pkm-theme`. Tag chip colors are the Saturn grayscale palette
  (4 light + 4 dark values), assigned by tag index, applied inline in JS (re-rendered on toggle).
- Screen mapping from the Saturn design → PKM: Today→**Notes** (hero ring = % of notes linked),
  Topics→**Tags** (accordion groups with per-tag rings), Progress→**Progress** (ring + stat
  cards + by-tag bars + recently edited), Add→**New note** form ("Add to Saturn" button).
  Note detail is its own screen (52px title input, View/Edit pills, backlinks ledger).
- **Google sign-in** is optional and uses Firebase Authentication browser modules. It is disabled
  until `public/firebase-config.js` is filled in. It scopes localStorage by Firebase user ID but
  does not add cloud sync.
- Note detail editing is now draft-based: title, tags, and body changes are not persisted until
  the **Save changes** button is clicked. One **Edit/Preview** button replaces the old View/Edit
  pair.
- Deleted notes move to a recoverable **Dead Stars** bin (`saturn-pkm-deleted-notes`) before any
  permanent removal.
- **AI provider is Gemini free tier, not Claude** (2026-07-03, user's choice for zero cost).
  Model `gemini-3.5-flash` via plain `fetch` from `api/ai.js` — the key never reaches the
  browser. The endpoint requires Google sign-in: the client's Firebase ID token is verified
  as a JWT (`jose` against Google's public JWKS) so strangers can't drain the shared free
  quota. Notes are sent per-request only; nothing is stored server-side.
- **Landing/app split** (2026-07-03): `index.html` is a marketing/how-to landing page;
  the app lives at `app.html` (`/app` with cleanUrls). Landing has its own inline CSS.
- **Sign-in is served through our own domain** (2026-07-04 fix for "firebaseapp.com
  unreachable" on the user's phone): `vercel.json` rewrites `/__/auth/*` to
  `saturn-1165b.firebaseapp.com`, `authDomain` = `saturn-pkm.vercel.app`, and the user added
  `https://saturn-pkm.vercel.app/__/auth/handler` to the Google OAuth client's authorized
  redirect URIs. Also the fix for mobile-browser storage-partitioning redirect issues.
  Mobile uses `signInWithRedirect` (coarse-pointer heuristic) with popup fallback on desktop.
- **Privacy in the sidebar** (2026-07-05, user request): never display the email address —
  display name + "Signed in with Google" only.
- **Graph view** (2026-07-05): chosen by the user over "related notes", "tags-only", and
  "re-present backlinks" when asked how to evolve the backlinks idea. Hand-rolled canvas
  force simulation (repulsion + link springs + center gravity), zero dependencies; the
  per-note "Linked from" list remains.

## Progress log
- **2026-07-02** — Pivoted plan from study tracker → PKM (`pkm-plan.md` written).
- **2026-07-02** — Extracted Saturn design tokens (palette, fonts, radii, shadows, layout) from `Saturn.html`.
- **2026-07-02** — Built the full app (`index.html`, `style.css`, `script.js`) — all 7 phases in one pass.
- **2026-07-02** — Verified: `node --check` passes; **13/13 logic tests pass** (Markdown rendering, wiki links, case-insensitive backlinks, orphan detection, HTML escaping/XSS, bold-vs-italic ordering).
- **2026-07-02** — ⚠️ Full in-browser (Playwright) test blocked: WSL is missing Chromium system libs (`libnspr4`, `libnss3`). To enable, run `sudo apt-get install -y libnspr4 libnss3 libasound2t64`. Untested-in-browser: click handlers, view switching, localStorage in a real page (logic behind them is tested).
- **2026-07-02** — **Full UI redesign to match Saturn.html exactly.** Extracted the real page
  from the bundler export, cloned its tokens/components (monochrome light+dark themes, sidebar
  with logo SVG + Menu nav + accent add button + theme toggle, hero ring card, pill filters,
  ledger rows, accordion tag groups, progress grid, add form). All PKM logic kept.
  Verified: `node --check` passes; **21/21 logic tests pass** (markdown, wiki links, backlinks,
  orphans, XSS escaping, tag colors per theme, filters, search, persistence). Browser test still
  blocked by the same missing libs (confirmed via `ldd`: libnspr4/libnss3/libasound missing).
- **2026-07-02** — Ring-text legibility fix (user request): enlarged the solid inner discs so the
  Saturn ellipses never cross the text (hero r60→66, progress r40→47), center text switched from
  muted gray to ink (sub-line at 0.72 opacity), progress % downsized 36→31px to fit its disc.
- **2026-07-02** — Reorganized folder for deployment (user-approved layout): app → `public/`,
  plans + new docs → `docs/`, Saturn.html → `design/`; deleted Windows `Zone.Identifier` files.
  Added `README.md`, `docs/USAGE.md`, `docs/DEPLOY.md`, and `vercel.json` (static, no build).
- **2026-07-02** — Hero-ring redesign for legibility (user couldn't read the center text):
  removed the second (inner) decorative ellipse, enlarged the solid disc r66→71, number 66→58px.
  **Browser testing unblocked without sudo**: `apt-get download libnspr4 libnss3 libasound2t64`,
  `dpkg -x` into a scratch dir, launch Playwright Chromium with `LD_LIBRARY_PATH` pointing there.
  Verified with real screenshots in light + dark mode — center text sits fully on the solid disc.
- **2026-07-02** — Codex feature pass: made row deletion explicit with labeled Delete buttons,
  added optional Firebase Google sign-in UI/config/docs, and added `CODEX_CONTEXT.md`.
- **2026-07-02** — Added Dead Stars bin for deleted notes, restore/delete-forever controls,
  one-button Edit/Preview toggle, and explicit Save changes flow for note edits.
- **2026-07-03** — Initialized the git repo (`main`), set git identity, and pushed to
  GitHub: https://github.com/emmanuelrukevwe123-lgtm/saturn-pkm (private). Ready for
  Vercel import per `docs/DEPLOY.md` Option A; Vercel account connection still pending.
- **2026-07-03** — **AI features added** (user request; Gemini free tier chosen over paid
  Claude API): `api/ai.js` Vercel serverless function proxies to `gemini-3.5-flash`
  (`streamGenerateContent`, SSE re-streamed as plain text). Endpoint requires Google
  sign-in — Firebase ID token verified as a JWT via `jose` (env: `GEMINI_API_KEY`,
  `FIREBASE_PROJECT_ID`). Client: ✦ Summarize button on the note toolbar (streaming
  panel + "Insert into note" that appends an `## AI summary` section to the draft) and
  an "Ask Saturn" card on the Notes screen (Q&A over all notes, answers cite
  [[Note titles]]). AI controls disabled until signed in. New `docs/AI.md`;
  `package.json` added (`jose` only — app itself still build-free). Still pending:
  user's Firebase config values, Gemini key, Vercel import + env vars.

- **2026-07-03** — Mobile + landing pass (user feedback from phone testing): responsive
  layout via one `@media (max-width: 880px)` block (sidebar becomes a wrapping top bar,
  compact auth chip, type scales down, stat grid stacks); fixed auth-card email overflow
  (`overflow-wrap: anywhere` + card `overflow: hidden`); Ask Saturn moved from a home-screen
  card to a floating ✦ button (bottom-right) opening a popover (Esc closes); mobile Google
  sign-in switched to `signInWithRedirect` on coarse-pointer devices with popup-blocked
  fallback + `getRedirectResult` error surfacing; **landing page added as `index.html`**
  (Saturn-styled, self-contained CSS, light/dark via `prefers-color-scheme`) with the app
  moved to `app.html` (→ `/app` with Vercel cleanUrls). Firebase config filled from the
  user's project (`saturn-1165b`) — ⚠️ `appId` value looks like the storageBucket; awaiting
  the real `1:…:web:…` value. User's own edit kept: sidebar motto now "Connect ideas".

- **2026-07-03/04** — **Deployed live.** User created the Vercel project (env vars
  `GEMINI_API_KEY` + `FIREBASE_PROJECT_ID`) and added the Firebase authorized domain;
  correct `appId` wired in (first value pasted was the storageBucket); planet favicon
  added (SVG, theme-aware); live URL recorded in README/CONTEXT. Mobile sign-in initially
  failed ("firebaseapp.com unreachable") → fixed by serving the whole sign-in flow through
  our own domain (auth proxy — see Key decisions); user then confirmed **sign-in works**.
- **2026-07-05** — Post-launch polish (user requests): email address no longer shown in the
  sidebar (name + "Signed in with Google" only); Ask Saturn placeholder shortened and input
  overflow fixed (`min-width: 0`); **Graph screen added** (user chose "visual graph view"
  when asked how to evolve backlinks) — hand-rolled canvas force simulation, no libraries:
  notes as stars sized by degree, [[links]] as threads, drag to rearrange, tap to open,
  labels with surface halo, theme-aware colors read from CSS vars each frame. Verified via
  Playwright: renders desktop + mobile, tap-to-open works, no console errors. Sign-in
  confirmed working by the user after the auth-proxy fix (vercel.json rewrites /__/auth/*
  to firebaseapp.com; authDomain = saturn-pkm.vercel.app; user added the redirect URI to
  the Google OAuth client).

- **2026-07-05** — Hideable sidebar (user request): fixed hamburger button top-left on all
  screen sizes. Desktop: collapses/restores the sidebar (`body.nav-hidden`). Mobile: sidebar
  is now a slide-in drawer (`body.nav-open`) with dimmed backdrop — replaces the previous
  top-bar layout; button morphs to an X; closes on backdrop tap, nav selection, or Esc.
  Landing copy updated to drop the "backlinks" pitch in favor of the Graph (hero, feature
  card, how-to step, meta description). Note: the per-note "Linked from" panel still exists
  in the app. Verified via Playwright at 1440px/390px, no errors.

## Features shipped
- Two-pane Saturn-styled UI (monochrome light + dark themes, Baloo 2 + Quicksand, 252px sidebar)
- **Mobile responsive** — sidebar collapses to a wrapping top bar under 880px
- **Landing page** at `/` explaining the app; app at `/app`
- Create / edit / delete notes; draft editing with Edit/Preview toggle + explicit Save changes
- Explicit note-row Delete buttons with confirmation
- Deleted-note Dead Stars bin with restore and delete-forever actions
- **Google sign-in** through Firebase Authentication (per-account local notebooks; email never displayed;
  mobile-friendly redirect flow served through our own domain)
- localStorage persistence (`saturn-pkm-notes`, per-user `saturn-pkm-notes:<uid>` when signed in)
- Markdown: `# ## ###` headings, `**bold**`, `*italic*`, `` `code` ``, `- lists`, paragraphs
- `[[Wiki links]]` — clickable; missing targets render dashed, click-to-create
- Backlinks panel ("Linked from") per note
- **Graph screen** — force-directed map: notes as stars sized by connections, links as threads,
  drag to rearrange, tap to open
- Tags (comma input → chips) + tag filter + live search
- Stats view: note/link/orphan counts, % linked progress ring, orphan list, recently edited
- **AI (free Gemini)**: ✦ Summarize on each note (streaming panel + "Insert into note") and
  Ask Saturn floating ✦ popover (Q&A over all notes, answers cite [[Note titles]]);
  sign-in-gated, streaming, quota-friendly error messages
- Planet favicon (theme-aware SVG)
- First-run seed: 2 linked starter notes explaining the app

## Phase status
| Phase | What | Status |
|---|---|---|
| 1 | Static two-pane layout + design system | ✅ Done |
| 2 | Create & display notes with JS | ✅ Done |
| 3 | localStorage persistence | ✅ Done |
| 4 | Markdown rendering | ✅ Done |
| 5 | `[[Links]]` + backlinks | ✅ Done |
| 6 | Tags & search | ✅ Done |
| 7 | Stats dashboard & polish | ✅ Done (incl. dark theme + graph map) |
| — | Beyond the plan: deploy, sign-in, AI, mobile, landing, graph | ✅ Done |

## Possible next steps (not committed)
- Cloud sync so notes follow the user across devices (Firestore would pair naturally
  with the existing Firebase auth)
- Restrict AI to an email allowlist if strangers ever drain the shared Gemini quota
- Custom domain on Vercel

## How to run
- **Production**: https://saturn-pkm.vercel.app (landing) / https://saturn-pkm.vercel.app/app (app)
- **Locally**: open `public/app.html` in any browser (from Windows:
  `\\wsl.localhost\Ubuntu-24.04\home\vulamlomo\Learning Software\public\app.html`),
  or from WSL: `cd ~/"Learning Software"/public && python3 -m http.server` → http://localhost:8000/app.html
- **With the AI endpoint locally**: `npx vercel dev` with `GEMINI_API_KEY` + `FIREBASE_PROJECT_ID` set

## Deployment
**LIVE at https://saturn-pkm.vercel.app** (Vercel free Hobby plan; auto-deploys on every
push to `main`). Verified: landing at `/`, app at `/app`, static assets 200, `/api/ai`
returns 405 on GET and 401 to unauthenticated POSTs (proving `GEMINI_API_KEY` +
`FIREBASE_PROJECT_ID` env vars are set), sign-in handler served through our domain at
`/__/auth/handler` (200), favicon live, and the deployed `firebase-config.js` carries the
corrected appId. Google sign-in confirmed working end-to-end by the user (2026-07-05).
User-side console setup that exists outside this repo: Vercel env vars, Firebase
authorized domains (incl. `saturn-pkm.vercel.app`), and the Google OAuth client's
authorized JS origin + redirect URI for the auth proxy.
GitHub repo: https://github.com/emmanuelrukevwe123-lgtm/saturn-pkm.
