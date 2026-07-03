# Codex Context - Saturn PKM

## Current Understanding

Saturn is a static, local-first personal knowledge management app. It is built with plain HTML, CSS, and JavaScript, with no framework, package manager, build step, or backend.

The app lets a user create Markdown notes, connect them with `[[Note title]]` links, view backlinks, organize by tags, search notes, recover deleted notes from a Dead Stars bin, and track how connected the note collection is.

## Repository Shape

| Path | Purpose |
|---|---|
| `public/index.html` | Browser app structure and screen markup |
| `public/firebase-config.js` | Optional Firebase web config for Google sign-in |
| `public/style.css` | Saturn visual system, layout, light/dark theme styling |
| `public/script.js` | All app state, persistence, rendering, events, Markdown, links, tags, and stats |
| `design/Saturn.html` | Reference design export only |
| `docs/USAGE.md` | End-user guide |
| `docs/GOOGLE_AUTH.md` | Optional Google sign-in setup |
| `docs/DEPLOY.md` | Static Vercel deployment guide |
| `docs/pkm-plan.md` | Original PKM build plan |
| `docs/study-tracker-plan.md` | Historical pre-pivot plan |
| `CONTEXT.md` | Existing project history and implementation log |
| `vercel.json` | Vercel static output configuration |

## Architecture Notes

- App state is held in `notes` for active notes and `deletedNotes` for the Dead Stars bin.
- Signed-out notes persist in `localStorage` under `saturn-pkm-notes`.
- Signed-out deleted notes persist in `localStorage` under `saturn-pkm-deleted-notes`.
- Signed-in notes persist locally under `saturn-pkm-notes:<firebase-user-id>`.
- Signed-in deleted notes persist locally under `saturn-pkm-deleted-notes:<firebase-user-id>`.
- Theme persists in `localStorage` under `saturn-pkm-theme`.
- Links are derived by scanning note bodies for `[[...]]`; they are not stored as a separate field.
- Backlinks are derived by scanning every other note for links to the selected note title.
- Title matching is case-insensitive.
- Markdown is a small hand-rolled renderer that escapes HTML before applying formatting.
- The deployed surface is only `public/`.

## Implementation Constraints

- Keep the app static unless the user explicitly requests a backend or sync.
- Prefer editing the existing three app files instead of introducing tooling.
- Do not edit `design/Saturn.html`; use it only as a visual reference.
- Preserve localStorage compatibility when changing the note data model.
- Re-render affected screens after state changes so tag colors, stats, links, and backlinks stay current.
- Run `node --check public/script.js` after JavaScript edits.
- Note detail edits are draft-based. Title, tags, and body changes do not persist
  until `Save changes` is clicked.
- Deleting a note moves it to `deletedNotes`; only `Delete forever` removes it
  from localStorage permanently.
- Google sign-in uses Firebase Authentication from browser modules. It is optional
  and remains disabled until `public/firebase-config.js` is filled in.
- Google sign-in does not sync notes across devices; it only scopes localStorage
  by account.

## Current Verified State

- `node --check public/script.js` passes.
- The current directory is not a usable Git repository from this environment; `git status` reports that it is not a git repository.

## Recent Feature Work

- Delete note controls were made explicit in note rows while preserving the
  detail-screen delete flow.
- Optional Google sign-in was added through Firebase Authentication.
- Dead Stars bin added for recoverable deleted notes.
- View/Edit pair replaced with one Edit/Preview toggle and an explicit Save button.
