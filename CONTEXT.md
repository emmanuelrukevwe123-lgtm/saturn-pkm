# Project Context — Saturn PKM

> Living log of what Claude is building and why. Updated as work happens.

## What this project is
A **Personal Knowledge Management system** (Zettelkasten-style linked notes) built with
**plain HTML/CSS/JS** — no frameworks, no build step. Notes are Markdown, link to each
other via `[[Note title]]`, and show backlinks. Data lives in `localStorage`.

- Plan: `pkm-plan.md` (7 phases)
- Design reference: `Saturn.html` (design-tool export — reference only, never edited).
  It's a bundler export: the real page is JSON-encoded on line 180 (`__bundler/template`).
- Design language (since 2026-07-02 redesign): **exact clone of the Saturn export as rendered** —
  monochrome LIGHT/DARK palettes (light: `#EAEAEA` bg / `#141414` accent; dark inverted),
  Baloo 2 headings (52px page titles, weight 400), Quicksand body, 252px sidebar,
  980px content column, ring cards, pill filters, ledger rows.
  (The earlier cream/terracotta look came from the template's *fallback* values, which the
  rendered design overrides with theme vars.)

## Files (reorganized 2026-07-02 for Vercel)
| File | Purpose |
|---|---|
| `public/index.html` | Structure: sidebar + screens (Notes, note detail, Tags, Progress, Add) |
| `public/firebase-config.js` | Optional Firebase web config for Google sign-in |
| `public/style.css` | Saturn design tokens as CSS variables (light + `.dark`) + all styling |
| `public/script.js` | All logic: state, localStorage, rendering, Markdown, links, tags, stats |
| `docs/pkm-plan.md` | The build plan |
| `docs/USAGE.md` | End-user guide to the app |
| `docs/GOOGLE_AUTH.md` | Optional Google sign-in setup |
| `docs/DEPLOY.md` | Vercel free-plan deployment plan (dashboard + CLI flows) |
| `design/Saturn.html` | Design reference export — never edited |
| `vercel.json` | No build; serve `public/` (`outputDirectory`) |
| `README.md` | Project overview + structure |
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

## Features shipped
- Two-pane Saturn-styled UI (cream/terracotta, Baloo 2 + Quicksand, sidebar 252px)
- Create / edit / delete notes; one-button Edit/Preview toggle
- Explicit note-row Delete buttons with confirmation
- Deleted-note Dead Stars bin with restore and delete-forever actions
- Draft editing with one Edit/Preview toggle and explicit Save changes button
- Optional Google sign-in through Firebase Authentication (local notebook scoping only)
- localStorage persistence (`saturn-pkm-notes` key)
- Markdown: `# ## ###` headings, `**bold**`, `*italic*`, `` `code` ``, `- lists`, paragraphs
- `[[Wiki links]]` — clickable; missing targets render dashed, click-to-create
- Backlinks panel ("Linked from") per note
- Tags (comma input → chips) + tag filter + live search
- Stats view: note/link/orphan counts, % linked progress ring, orphan list, recently edited
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
| 7 | Stats dashboard & polish | ✅ Done (dark theme + graph map deferred) |

## How to run
Open `public/index.html` in any browser. From Windows:
`\\wsl.localhost\Ubuntu-24.04\home\vulamlomo\Learning Software\public\index.html`
(or from WSL: `cd ~/"Learning Software"/public && python3 -m http.server` → http://localhost:8000)

## Deployment
Target: **Vercel free (Hobby) plan** as a static site — see `docs/DEPLOY.md`.
`vercel.json` is committed (no build command, output dir `public/`). Not yet a git
repo / not yet deployed as of 2026-07-02.
