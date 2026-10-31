# Saturn 🪐 — knowledge, in orbit

**Live at https://saturn-pkm.vercel.app**

A **personal knowledge management** app (Zettelkasten-style linked notes) built with
React and Vite, with a small authenticated serverless AI endpoint.
Notes link to each other with `[[Note title]]`, show backlinks automatically,
render as a live **Graph**, and can hold **images** (compressed, stored in
IndexedDB, resizable by dragging). A **Planner** adds kanban project boards
with drag-and-drop tasks that link back to notes, and **Orbit** keeps you on two
active projects at a time, with parked ideas, session logs and weekly reviews. Deleted notes rest in a
recoverable Dead Stars bin. Data is local-first; portable `.saturn` backups include records and images, and optional owner-only Firebase sync ships behind a feature flag.

The UI is the Saturn design export's layout (`design/Saturn.html`) in a retro
**"Mission Control '72"** palette — cream paper, brown-teal ink, burnt-orange
accents, a slatted sun in light mode and a starfield in dark. Baloo 2 /
Quicksand type, progress rings, ledger-style lists.

## Project structure

```
├── index.html                Landing page (what the app is + how to use it)
├── app.html                  The app's entry page (served at /app)
├── src/
│   ├── main.jsx, App.jsx     React entry point and app shell
│   ├── AppContext.jsx        Shared state: navigation, drafts, sign-in, sync
│   ├── screens/, components/ The React UI
│   ├── lib/                  Rules, persistence, backup and sync: plain, tested JS
│   ├── config.js             Firebase web config and the sync flag
│   └── style.css
├── public/                   Static files copied as is (favicon)
├── api/
│   └── ai.js                 Vercel serverless function — Gemini AI proxy
├── docs/
│   ├── USAGE.md              How to use the app
│   ├── AI.md                 AI features (Summarize / Ask Saturn) + setup
│   ├── GOOGLE_AUTH.md        Optional Google sign-in setup
│   ├── DEPLOY.md             Deploying to Vercel (free plan)
│   ├── pkm-plan.md           The original build plan
│   └── study-tracker-plan.md Earlier (pre-pivot) plan, kept for history
├── design/
│   └── Saturn.html           Design reference export — never edited
├── CONTEXT.md                Living log of what was built and why
├── firestore.rules / storage.rules  Owner-only cloud policy
├── tests/                    Unit, API, rules, browser, and axe tests
├── package.json              Dependencies and scripts
├── vite.config.js            Build configuration
└── vercel.json               Vercel build, security headers and auth rewrites
```

## Run locally

Install the pinned Node version and dependencies, then start the local server:

```bash
nvm use
npm ci
npm run dev
```

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) — it deploys to Vercel's free Hobby plan
as a plain static site.

## Docs

- **[How to use Saturn](docs/USAGE.md)** — notes, wiki links, backlinks, tags, images, the Graph, the Planner, themes
- **[AI features](docs/AI.md)** — ✦ Summarize + Ask Saturn (free Gemini API, requires sign-in)
- **[Google sign-in setup](docs/GOOGLE_AUTH.md)** — optional Firebase Authentication setup
- **[Deploying to Vercel](docs/DEPLOY.md)**

## A note about your data

Records are cached in **your browser's localStorage**. Signed-out notes use
the key `saturn-pkm-notes`, deleted notes use `saturn-pkm-deleted-notes`,
planner data uses `saturn-pkm-planner-*`, and signed-in data uses
Google-user-specific keys. Images are stored as compressed blobs in the
browser's IndexedDB (`saturn-pkm-images`). Use Data & Sync to export or restore a complete backup. Cloud sync remains off unless the build sets `VITE_CLOUD_SYNC=true` after deploying Firebase rules. When enabled, authenticated records and images use owner-scoped Firestore and Storage paths while local storage remains the offline cache.

## Verification

`npm run check` runs lint, unit/API tests, then desktop and mobile browser tests against the production build with its production security headers. `npm run test:rules` starts Firebase emulators and checks cross-user denial. See [CONTRIBUTING.md](CONTRIBUTING.md).
