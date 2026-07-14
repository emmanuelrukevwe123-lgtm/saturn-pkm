# Saturn 🪐 — knowledge, in orbit

**Live at https://saturn-pkm.vercel.app**

A **personal knowledge management** app (Zettelkasten-style linked notes) built with
plain HTML, CSS, and JavaScript — no frameworks, no build step, no server.
Notes link to each other with `[[Note title]]`, show backlinks automatically,
render as a live **Graph**, and can hold **images** (compressed, stored in
IndexedDB, resizable by dragging). A **Planner** adds kanban project boards
with drag-and-drop tasks that link back to notes. Deleted notes rest in a
recoverable Dead Stars bin. Everything is stored in your browser.

The UI is the Saturn design export's layout (`design/Saturn.html`) in a retro
**"Mission Control '72"** palette — cream paper, brown-teal ink, burnt-orange
accents, a slatted sun in light mode and a starfield in dark. Baloo 2 /
Quicksand type, progress rings, ledger-style lists.

## Project structure

```
├── public/       The site — this is what gets deployed
│   ├── index.html            Landing page (what the app is + how to use it)
│   ├── app.html              The app itself (served at /app)
│   ├── firebase-config.js    Firebase config for Google sign-in
│   ├── style.css
│   └── script.js
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
├── package.json              Deps for the serverless function only (jose)
└── vercel.json               Tells Vercel to serve public/ with no build step
```

## Run locally

No install needed. Either open `public/app.html` directly in a browser (or
`public/index.html` for the landing page), or serve it. Use the local server
option when testing Google sign-in:

```bash
cd public && python3 -m http.server   # → http://localhost:8000
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

Notes live entirely in **your browser's localStorage**. Signed-out notes use
the key `saturn-pkm-notes`, deleted notes use `saturn-pkm-deleted-notes`,
planner data uses `saturn-pkm-planner-*`, and signed-in data uses
Google-user-specific keys. Images are stored as compressed blobs in the
browser's IndexedDB (`saturn-pkm-images`) and are cleaned up automatically
when nothing references them. Nothing is uploaded anywhere — which also means
data doesn't sync between browsers or devices, and clearing site data deletes it.
