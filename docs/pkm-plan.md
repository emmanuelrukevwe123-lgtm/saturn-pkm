# Personal Knowledge Management (PKM) — Build Plan

A personal app to capture ideas as small **notes**, **link** them together, and grow a
web of connected knowledge — a beginner's Zettelkasten ("linked notes") built with
**HTML, CSS, and JavaScript only**.

Each phase teaches exactly what the next one needs. Same teaching structure as the
original study-tracker plan.

---

## Context (why this, why now)

The original plan was a *study tracker* — a to-do list of study items sorted by
deadline/priority. This is a pivot to a **Personal Knowledge Management system** instead:
not "what should I do next," but "capture what I know and see how ideas connect."

The stack stays the same (plain HTML/CSS/JS, no frameworks, beginner-friendly, localStorage
for storage) so the learning path built up in the study-tracker plan still applies — we're
changing *what* we build, not the tools. A design system will be layered on afterward, so
this plan focuses on structure and behavior, not final visuals.

---

## Core Idea (read this first)

Strip away everything and the whole app is:

> A collection of **notes**. Each note has a **title** and a **Markdown body**. Notes
> **link to each other** by name. The app's real value is seeing those links — including
> **backlinks** (which other notes point *here*).

That's the difference between this and a notes app: a plain notes app is a *list*; a PKM is
a *web*. The links are the point.

**Golden rule:** Don't build the whole vision at once. Phases 1–3 give you a working
note-taking app. Phase 5 (linking) is what makes it a *knowledge* system. Everything after
is enhancement.

---

## The Data Model

Every note is just a JavaScript object:

```javascript
{
  id: 1,
  title: "Spaced repetition",
  body: "Reviewing material at **increasing intervals**.\nRelated: [[Active recall]]",
  tags: ["learning", "memory"],
  created: "2026-07-02T10:00:00.000Z",
  updated: "2026-07-02T10:00:00.000Z"
}
```

Your entire app is:
1. An **array** of these note objects
2. **Saved** to localStorage
3. **Displayed** — a list of titles, plus one note shown in full
4. **Rendered** — the Markdown body turned into HTML
5. **Linked** — `[[Note title]]` in a body becomes a clickable jump to that note

Note: **links are not stored** as a separate field. They live inside the body as
`[[Note title]]` text, and we *find* them by scanning the body. Backlinks are found by
scanning *all* notes for links pointing at the current one. Hold this picture the whole way.

---

## Suggested Layout

A classic two-pane knowledge app:

```
+-----------------+--------------------------------+
|  Sidebar        |  Main pane                     |
|  - Search box   |  Title                         |
|  - + New note   |  [ View (rendered) / Edit ]    |
|  - Note list    |  body...                       |
|    (titles)     |                                |
|                 |  Backlinks: notes linking here |
+-----------------+--------------------------------+
```

Use **flexbox** for the two columns. Sidebar ~**252px**, content centered (~980px max).

---

## Design System — "Saturn" look

The UI design (`Saturn.html`) was originally drawn for the study tracker, so we **reuse its
visual language, not its study screens**. It's a design-tool export (bundled, templated,
hashed fonts) — treat it as a *reference only*; do **not** edit that file. We lift its tokens
into our own clean `style.css`.

**Palette — warm & cozy (cream + terracotta):**

```css
:root {
  --bg:      #FBF8F1;   /* page background */
  --surface: #EFE7D8;   /* cards / sidebar */
  --surface-2:#E4DBCA;  /* hover / subtle panels */
  --line:    #EBE3D3;   /* borders */
  --ink:     #1B1712;   /* main text */
  --muted:   #8A7C63;   /* secondary text */
  --accent:  #DD5528;   /* terracotta — buttons, active, links */
  --radius:  12px;      /* cards (8–18px range) */
  --radius-pill: 999px; /* buttons/tags */
  --shadow:  0 1px 4px rgba(0,0,0,0.08);
}
```
*(Keeping tokens as CSS variables means a `.dark` theme can be added later by overriding
these — we're doing **light only** for now.)*

**Fonts:** load via Google Fonts `<link>` (simpler than the bundled `.woff2` files):
- **Baloo 2** — headings / titles (rounded, friendly)
- **Quicksand** — body & UI, weight 600

**Shape language:** rounded corners everywhere, pill-shaped buttons/tags, soft shadow.

**Saturn component → PKM mapping:**

| Saturn (study) | PKM (linked notes) |
|---|---|
| Sidebar + menu | Sidebar: search, `＋ New note`, note list, tag filters |
| `＋ Add study` pill | `＋ New note` pill |
| Item row (check/title/category/due/priority) | Note row: title, tags, updated date |
| `Add to study` form | New-note form: title, body, tags |
| **Progress ring + stat cards** | **Knowledge stats: note count, total links, orphan notes** |
| Topics / By subject | Group by tag |

---

## Phase 1 — Static Structure + Design System (HTML + CSS)

**Goal:** Build the two-pane layout with the Saturn look, zero interactivity.

- [ ] Create `index.html`, `style.css`, `script.js`
- [ ] Add the Google Fonts `<link>` (Baloo 2 + Quicksand)
- [ ] Put the palette/`:root` tokens above at the top of `style.css`, then style using
      `var(--...)` (never hard-code the colors again)
- [ ] Header/title bar (Baloo 2)
- [ ] Left sidebar (~252px, `--surface`): a search box, a `＋ New note` pill button, and a
      placeholder note list
- [ ] Main pane: a title area and a body area (static text for now)
- [ ] Two columns with **flexbox**; rounded cards, soft shadow, pill buttons

**You'll learn:** HTML elements, forms/inputs, CSS, **CSS custom properties (variables)**,
web fonts, flexbox, two-column layouts.

---

## Phase 2 — Create & Display Notes with JavaScript

**Goal:** Make "+ New note" actually create a note, and clicking a title show it.

- [ ] On "+ New note", create a note object (see data model), push to an array
- [ ] Render the array as a clickable list of titles in the sidebar
- [ ] Clicking a title shows that note's title + body in the main pane
- [ ] An editable title field and body `textarea` that update the selected note
- [ ] Set `updated` timestamp whenever a note changes

**You'll learn:** variables, functions, arrays, objects, `querySelector`,
`addEventListener`, creating/appending DOM elements, tracking a "currently selected" id.
**This is the heart of JavaScript.**

---

## Phase 3 — Make It Persist

**Goal:** Stop losing notes on refresh. This turns a toy into a real tool.

- [ ] Save the notes array to `localStorage` on every change (`JSON.stringify`)
- [ ] Load it on page open (`JSON.parse`), handling the empty/first-run case
- [ ] Re-render the list and last-open note on load

**You'll learn:** `localStorage`, JSON, saving/loading, guarding against missing data.

> ✅ **Stop here and celebrate.** Phases 1–3 are a working note app you can actually use.
> Everything below turns it into a *knowledge* system.

---

## Phase 4 — Render Markdown

**Goal:** Show note bodies as formatted HTML instead of raw text, with an Edit/View toggle.

- [ ] Add an **Edit / View** toggle for the main pane
- [ ] In View mode, convert the Markdown body to HTML and display it
- [ ] Support a small Markdown subset first: `# heading`, `**bold**`, `*italic*`,
      `- list items`, and line breaks
- [ ] Write your own tiny converter (regex + string replace) so you learn parsing —
      keep it small. (Optional shortcut later: swap in a library like `marked.js`.)

**You'll learn:** strings, regular expressions, replacing text, building HTML from data,
`innerHTML` vs `textContent` (and why raw HTML input needs care).

**Order hint:** convert headings and lists line-by-line; convert bold/italic within a line.

---

## Phase 5 — Linking (the heart of a PKM)

**Goal:** Connect notes. `[[Note title]]` becomes a clickable link, and each note shows
its **backlinks**.

- [ ] While rendering, detect `[[Some title]]` patterns in the body
- [ ] Turn each into a clickable link that opens the matching note (match by title)
- [ ] If no note with that title exists, show it styled as a "missing" link (optionally
      click to create that note)
- [ ] Compute **backlinks**: scan every note's body for `[[This note's title]]` and list
      those notes in a "Linked from" panel under the note
- [ ] (Optional) A live suggestion when typing `[[` that lists existing titles

**You'll learn:** `filter`/`map`, searching across an array, matching by name, deriving
relationships from data instead of storing them. This is the Zettelkasten payoff.

---

## Phase 6 — Tags & Search

**Goal:** Find notes fast and group them.

- [ ] Add tags to notes (comma-separated input → `tags` array)
- [ ] Show tags on a note; clicking a tag filters the list to that tag
- [ ] Make the sidebar search box do a live **filter** of titles (and optionally bodies)
- [ ] An "all notes" view to clear filters

**You'll learn:** `filter`, `includes`, live search, splitting/trimming strings, arrays of
strings.

---

## Phase 7 — Polish & Analyze

**Goal:** Make it feel finished and reveal the shape of your knowledge — reusing Saturn's
**stat cards / progress ring** visuals for *knowledge* stats instead of study stats.

- [ ] Sort the note list by most recently updated
- [ ] **Stat cards (Saturn style):** total **note count**, total **link count**, and
      **orphan count** — the repurposed dashboard
- [ ] Highlight **orphan notes** (no links in or out) so you can connect them
- [ ] A "recently edited" section
- [ ] (Stretch) Turn one stat into a Saturn-style **progress ring** (e.g. % of notes that
      are linked, i.e. non-orphans)
- [ ] (Stretch) A simple visual map of which notes link to which
- [ ] Delete-note button with a confirm

**You'll learn:** `sort` with dates, deriving stats from your array, conditional styling.

---

## What to Learn, In Order

Each builds on the last:

1. **HTML** — elements, forms, inputs
2. **CSS** — flexbox, two-column layout, **CSS variables (design tokens)**, web fonts
3. **JS basics** — variables, functions, arrays, objects
4. **DOM manipulation** — `querySelector`, `addEventListener`, creating elements, selection state
5. **localStorage** — saving/loading JSON
6. **Strings & regex** — Markdown rendering, detecting `[[links]]`
7. **Array methods** — `filter`, `map`, `sort` for search, backlinks, and stats

---

## Progress Tracker

| Phase | What it does | Status |
|-------|--------------|--------|
| 1 | Static two-pane layout | ✅ Done |
| 2 | Create & display notes with JS | ✅ Done |
| 3 | Save to localStorage | ✅ Done |
| 4 | Render Markdown | ✅ Done |
| 5 | Linking + backlinks | ✅ Done |
| 6 | Tags & search | ✅ Done |
| 7 | Polish & analytics | ✅ Done (see CONTEXT.md) |

Update as you go: ⬜ Not started → 🟡 In progress → ✅ Done

---

## A Note on Security (worth knowing early)

Rendering Markdown means putting user text into the page as HTML (`innerHTML`). Since this
is a personal, local, single-user app, that's fine. Just *know* that if this ever became
multi-user, unescaped HTML in note bodies would be an XSS risk — the safe habit is to
escape raw HTML before applying your Markdown rules.

---

## How to Verify It Works (end to end)

No build step — just open `index.html` in a browser (or run a tiny static server like
`python3 -m http.server` from the project folder).

- **Phase 2–3:** Create a note, edit it, refresh the page → it's still there.
- **Phase 4:** Type `# Hello` and `**bold**` in a body → View mode shows a heading and bold text.
- **Phase 5:** In note A, write `[[B]]`; create note B → the link in A is clickable and
  opens B, and B shows A under "Linked from."
- **Phase 6:** Add a tag, click it → list filters; type in search → list narrows live.
- **Phase 7:** A note with no links shows as an orphan; counts update as you add notes.

---

## Files

- `index.html` — structure (sidebar + main pane) + Google Fonts link
- `style.css` — Saturn design tokens (`:root` variables) + flexbox layout and styling
- `script.js` — all logic: state array, render, localStorage, Markdown, links
- `Saturn.html` — **reference only** (the visual design); do not edit or ship it

---

## Tips for Staying Unstuck

- **Build one checkbox at a time.** Don't advance until the current one works.
- **`console.log` everything** — especially your notes array and the selected id.
- **Refresh often.** Save and reload after every small change.
- **Type the code yourself.** Slower, but you actually learn it.
- **Working and ugly beats pretty and broken.** Styling comes with the design system later.
