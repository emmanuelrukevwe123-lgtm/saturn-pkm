# Using Saturn 🪐

Saturn is a linked-notes app: you write short notes, connect them with
`[[wiki links]]`, and watch your knowledge web grow. This guide covers every
feature, screen by screen.

---

## The sidebar

| Item | What it does |
|---|---|
| **Notes** | The home screen — your note list, search, and tag filters |
| **Tags** | Notes grouped by tag, each group with its own "how linked" ring |
| **Progress** | Stats: % linked, total links, orphans, per-tag breakdown |
| **Bin** | Deleted notes, shown as dead stars you can restore or remove forever |
| **＋ New note** | Opens the "Add a note" form |
| **Sign in with Google** | Optional Google login, if Firebase has been configured |
| **Light/Dark mode** | Toggles the theme (bottom of the sidebar; remembered between visits) |

---

## Creating a note

1. Click **＋ New note** in the sidebar.
2. Give it a title (required), optional comma-separated tags, and optional first lines.
3. Click **Add to Saturn**. The note opens in View mode.

You can also create notes *from links*: if a note contains `[[Some idea]]` and
no note with that title exists, the link renders dashed — clicking it offers to
create that note on the spot.

## Reading & editing a note

Open any note by clicking its row on the Notes screen. At the top you'll find:

- **The title** — click it and type to rename.
- **Edit / Preview button** — one button toggles between rendered Markdown and raw text.
- **Tags field** — comma-separated, e.g. `physics, ideas`.
- **Save changes** — commits title, tags, and body changes.
- **Delete** — moves the note to the Dead Stars bin.

Changes are kept as a draft until you click **Save changes**. If you leave a
note with unsaved edits, Saturn asks whether to discard them.

## Deleting a note

You can delete notes in two places:

- On the Notes screen, click the **Delete** button at the end of a note row.
- On a note's detail screen, click **Delete** near the View/Edit controls.

Saturn asks for confirmation before moving a note to the **Dead Stars** bin.
Deleting a note does not rewrite links in other notes; any `[[links]]` pointing
to it become dashed missing-note links.

## Restoring deleted notes

Open **Bin** in the sidebar. Deleted notes appear as dead-star rows.

- **Restore** brings a note back into your active notebook.
- **Delete forever** permanently removes it from the bin after confirmation.

## Writing in Markdown

Saturn renders a practical subset of Markdown:

| You type | You get |
|---|---|
| `# Heading` / `## Sub` / `### Small` | Headings (three levels) |
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `` `code` `` | inline `code` |
| `- item` | bullet lists |
| blank line | paragraph break |

## Linking notes — the heart of Saturn

Write `[[Note title]]` anywhere in a note's body:

- **Solid underlined link** → that note exists; click to jump to it.
- **Dashed gray link** → no note has that title yet ("ghost link"); click to create it.
- Titles match **case-insensitively** — `[[my idea]]` links to "My Idea".

**Backlinks** appear automatically: at the bottom of every note, "Linked from"
lists all notes whose bodies link *to* it. You never maintain these by hand.

A note with no links in *and* no links out is an **orphan**. The rings
throughout the app show what fraction of your notes are connected — the goal
of a Zettelkasten is to keep orphans near zero.

## Finding notes

- **Search** (Notes screen) — live-filters by title *and* body text.
- **Tag pills** (Notes screen) — click a tag to filter; click again to clear.
- **Tags screen** — expand a tag group to see everything filed under it.
- **Recently edited** (Progress screen) — your last five touched notes.

## Progress screen

- **Big ring** — percentage of notes that are linked into the web.
- **Links between notes** — total `[[link]]` count across all bodies.
- **Orphan notes** — how many notes are still unconnected.
- **By tag** — a bar per tag showing how linked that tag's notes are.

## Your data

- Notes are stored in your browser's **localStorage** under `saturn-pkm-notes`
  (theme choice under `saturn-pkm-theme`). Nothing leaves your machine.
- Deleted notes are stored separately under `saturn-pkm-deleted-notes`.
- If Google sign-in is configured and you sign in, Saturn stores notes in a
  Google-user-specific localStorage key. This separates local notebooks by
  account, but it does not sync notes between devices.
- That means: no cloud sync — a different browser or device starts fresh, and
  clearing site data deletes your notes.
- **Backup tip:** open the browser devtools console and run
  `copy(localStorage.getItem('saturn-pkm-notes'))` to copy all notes as JSON.
  To restore: `localStorage.setItem('saturn-pkm-notes', '<paste>')` and reload.
  If you are signed in, use the localStorage key that starts with
  `saturn-pkm-notes:` instead.

## First run

On a fresh browser, Saturn seeds two small linked notes ("Welcome to Saturn"
and "How linking works") that demonstrate linking. Feel free to delete them.
